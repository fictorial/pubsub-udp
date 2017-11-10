# PUBSUB over UDP

## Huh? Why?! This is pointless!

If you happen to have a use case wherein many remote clients need to subscribe
to topics and receive updates but those updates are just "nice to have" and
sometimes might be sent to the same client multiple times or never arrive at
all, use this server!

## Protocol

JSON over UDP

### Subscribe to Topic

- remote client shows interest in a topic
- any messages to this topic published by other clients will be forwarded to this subscriber/client

---

    { "type": "sub", "topic": string }

### Unsubscribe from Topic

- remote client shows no interest in a topic
- any messages to this topic published by other clients will not be forwarded to this subscriber/client

---

    { "type": "unsub", "topic": string }

### Publish to Subscribers of Topic

- sender does not need to be subscribed to the topic to send to it
- message is not sent back to sender

---

    { "type": "pub", "topic": string, "data": any }

### Server Messages

    { "type": "pub", "topic": string, "data": any }

    { "type": "internal error" }

## Configuration

    PORT=40001

    IDLE_TIMEOUT_MS=30000

    DEBUG=pubsub-ws

## LICENSE

MIT

## Author

Brian Hammond <brian@fictorial.com>
