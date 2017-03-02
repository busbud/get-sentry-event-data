#!/usr/bin/env node
const R = require("ramda");
const request = require("request-promise");
const URI = require("urijs");

const SENTRY_API_TOKEN = process.env.SENTRY_API_TOKEN;
if (!SENTRY_API_TOKEN) {
  console.log(`Please specify a SENTRY_API_TOKEN environment variable
Visit https://github.com/busbud/get-sentry-event-data#setup for more information`);
  process.exit(1);
}

const BASE_URI = new URI("https://sentry.io/api/0/");

const doc =
`
Usage:
  $0 <event_id>
  $0 --pages | number of pages to fetch default to 1
  $0 -h | --help
`.trimRight();

const argv = require("yargs")
  .usage(doc)
  .demand(1)
  .help("help")
  .argv;

const pages = parseInt(argv.pages, 10) || 1;

const event_id = argv._[0];

function fetch(method, path, options) {
  options = R.merge({
    method: method,
    url: BASE_URI.clone().segment(path).normalize().href(),
    headers: {
      Authorization: `Bearer ${SENTRY_API_TOKEN}`
    },
    json: true,
    resolveWithFullResponse: true
  }, options || {});

  return request(options);
}

function listIssueEvents(issue_id, max_page = 0, cursor = null) {
  const path = `/issues/${issue_id}/events/`;

  const options = {};
  if (cursor) options.qs = {cursor};

  return fetch("GET", path, options)
    .then(res => {
      const events = res.body;
      const defaultToEmptyString = R.defaultTo('');
      const findNextLink = R.pipe(defaultToEmptyString, R.split(','), R.filter(R.pipe(R.match(/rel="next"/), R.isEmpty, R.not)), R.head);
      const getCursor = R.pipe(defaultToEmptyString, R.match(/cursor="([a-zA-Z0-9:]*)"/), R.pathOr(null, ['1']));
      const next_link_cursor = R.pipe(findNextLink, getCursor)(res.headers.link);
      if (next_link_cursor && max_page !== 0) {
        return listIssueEvents(issue_id, --max_page, next_link_cursor)
          .then(R.concat(events));
      }

      return events;
    });
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

listIssueEvents(event_id, pages - 1)
  .then(events => {
    const extracted = R.map(format, events);

    console.log(JSON.stringify(extracted));
  })
  .catch(console.error);
