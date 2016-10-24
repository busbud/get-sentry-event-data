#!/usr/bin/env node
const R = require("ramda");
const request = require("request-promise");
const URI = require("urijs");

const SENTRY_API_TOKEN = process.env.SENTRY_API_TOKEN;
const BASE_URI = new URI("https://app.getsentry.com/api/0/");

const doc =
`
Usage:
  $0 <event_id>
  $0 -h | --help
`.trimRight();

const argv = require("yargs")
  .usage(doc)
  .demand(1)
  .help("help")
  .argv;

const event_id = argv._[0];

function fetch(method, path, options) {
  options = R.merge({
    method: method,
    url: BASE_URI.clone().segment(path).normalize().href(),
    headers: {
      Authorization: `Bearer ${SENTRY_API_TOKEN}`
    },
    json: true
  }, options || {});

  return request(options);
}

function listIssueEvents(issue_id) {
  const path = `/issues/${issue_id}/events/`;
  return fetch("GET", path);
}

function format(event) {
  const tags = R.reduce((acc, pair) => {
    if (acc.hasOwnProperty(pair.key)) {
      if (!R.isArrayLike(acc[pair.key])) {
        acc[pair.key] = [acc[pair.key]];  // Convert to array so we can append other values
      }

      acc[pair.key].push(pair.value);

    } else {
      acc[pair.key] = pair.value;
    }

    return acc;
  }, {}, R.prop("tags", event));

  return R.merge(
    R.pick(["context", "dateCreated", "dateReceived"], event),
    {tags: tags}
  );
}

listIssueEvents(event_id)
  .then(events => {
    const extracted = R.map(format, events);

    console.log(JSON.stringify(extracted));
  })
  .catch(console.error);
