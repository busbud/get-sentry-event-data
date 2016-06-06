# get-sentry-event-data
CLI tool for retrieving event data from Sentry.

## Usage
`get-sentry-event-data` iterates over a Sentry issue's events and emits each event's `context` as JSON
so you can use your tool chain (like [`jq`](https://stedolan.github.io/jq/)) to create custom reports to accelerate your investigation
of issues.

```sh
# install
npm install --global get-sentry-event-data

# run it
get-sentry-event-data 108098418 \
 | jq -s -r '.[] | map([.origin_xid,.destination_xid] | @tsv) | .[]' \
 | sort | uniq -c \
 | sort -r
```

## Setup
You'll need a Sentry token to retrieve data from the Sentry API. To create one, follow these steps:

- Visit https://app.getsentry.com/api/new-token/
- Select at least the `event:read` permission
- Create an environment variable `SENTRY_API_TOKEN` setting it to the newly created token

You're now ready to use `get-sentry-event-data`!
