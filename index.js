const debug = require('debug')('pubsub-udp')
const dgram = require('dgram')

const PORT = process.env.PORT || 40001
const IDLE_TIMEOUT_MS = Math.max(1000, parseInt(process.env.IDLE_TIMEOUT_MS, 10) || 30000)

// $topic => Set($clientKey)

const topics = new Map()

// $clientKey => {
//   address: str,
//   port: int,
//   topics: Set($topic),
//   lastSeen: $millis
// }

const clients = new Map()

function clientKeyFor (info) {
  return `${info.address}:${info.port}`
}

function didSeeClient (info, clientKey) {
  const now = Date.now()

  let client

  if (!clients.has(clientKey)) {
    client = {...info, topics: new Set(), lastSeen: now}
    clients.set(clientKey, client)
  } else {
    client = clients.get(clientKey)
    client.lastSeen = now
  }

  return client
}

function subscribe (client, clientKey, topic) {
  debug('subscribe: [%s]: %s', topic, clientKey)

  client.topics.add(topic)

  if (!topics.has(topic)) {
    topics.set(topic, new Set([clientKey]))
  } else {
    topics.get(topic).add(clientKey)
  }
}

function unsubscribe (client, clientKey, topic) {
  debug('unsubscribe: [%s]: %s', topic, clientKey)

  client.topics.delete(topic)

  if (topics.has(topic)) {
    const clientKeys = topics.get(topic)
    clientKeys.delete(clientKey)
    if (clientKeys.size === 0) topics.delete(topic)
  }
}

function publish (client, clientKey, topic, messageData) {
  debug('publish: %s => "%s": %s', clientKey, topic, messageData)

  let n = 0

  if (!topics.has(topic)) {
    debug('topic unknown "%s"', topic)
    return
  }

  const msg = JSON.stringify({ type: 'pub', topic, data: messageData })

  for (let subscriberKey of topics.get(topic)) {
    debug('publish to %s for topic "%s"', subscriberKey, topic)

    if (subscriberKey !== clientKey) {
      let client = clients.get(subscriberKey)
      if (!client) {
        debug('no client found for %s', subscriberKey)
        continue
      }

      sendTo(client, msg)
      n++
    }
  }

  debug('publish: %s => "%s": sent to %d clients', clientKey, topic, n)
}

function dropClient (client) {
  const key = clientKeyFor(client)

  debug('dropping client: %s', key)

  for (let topic of client.topics) {
    unsubscribe(client, key, topic)
  }

  clients.delete(key)
}

function broadcast (serverMessage) {
  for (let client of clients.values()) {
    sendTo(client, serverMessage)
  }
}

function sendTo (client, msg) {
  debug('<<< %s:%s: %s', client.address, client.port, msg)

  server.send(msg, client.port, client.address, err => {
    if (err) {
      let targetClient = clients.get(clientKeyFor(client))
      if (targetClient) dropClient(targetClient)
    }
  })
}

function dropIdleClients () {
  const now = Date.now()
  const lastSeenOK = now - IDLE_TIMEOUT_MS

  debug(`dropping idle clients timeout=${IDLE_TIMEOUT_MS / 1000}s`)

  for (let client of clients.values()) {
    if (client.lastSeen < lastSeenOK) {
      dropClient(client)
    }
  }
}

setInterval(dropIdleClients, 15000)

const server = dgram.createSocket('udp4')

server.on('error', (err) => {
  console.error(`server error:\n${err.stack}`)      // synchronous

  broadcast(JSON.stringify({
    type: 'internal error'
  }))

  process.exit(1)
})

server.on('message', (msg, rinfo) => {
  const clientKey = clientKeyFor(rinfo)

  try {
    msg = msg.toString('utf8')
    debug('>>> %s: %s', clientKey, msg)
    msg = JSON.parse(msg)
  } catch (error) {
    debug('>>> %s: %s', clientKey, error)
    return
  }

  const client = didSeeClient(rinfo, clientKey)

  switch (msg.type) {
    case 'sub':
      subscribe(client, clientKey, msg.topic)
      break

    case 'unsub':
      unsubscribe(client, clientKey, msg.topic)
      break

    case 'pub':
      publish(client, clientKey, msg.topic, msg.data)
      break
  }
})

server.on('listening', () => {
  const address = server.address()
  debug(`server listening ${address.address}:${address.port}`)
})

server.bind(PORT)

setInterval(function () {
  debug('tracking %d clients', clients.size)
}, 20000)
