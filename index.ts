#!/usr/bin/env node

import request from 'request-promise';
import URI from 'urijs';
import program from 'commander';
import Bluebird from 'bluebird';

const CONCURRENCY = 5;
const SENTRY_API_TOKEN = process.env.SENTRY_API_TOKEN;
const BASE_URI = URI('https://sentry.io/api/0/');

let eventId = 0;

program
  .version('3.0.0')
  .usage('[options] <event_id>')
  .arguments('<event_id>')
  .action(event_id => {
    eventId = event_id;
  })
  .option('-p, --pages [pages]', 'number of pages to fetch. defaults to 1', parseInt)
  .option('-o, --organisation [organisation]', 'organisation. required for extended events')
  .option('-n, --project-name [project-name]', 'project name. required for extended events')
  .option('-x, --extended-event', 'enable extended event')
  .parse(process.argv);

validate();

getSentryEventData()
  .then(JSON.stringify)
  .then(console.log)
  .catch(console.error);

async function getSentryEventData(): Promise<FormattedEvent[]> {
  const { organisation, projectName, pages = 1 } = program;

  const issue_events = await listIssueEvents(eventId, pages);

  const events: (Event | ExtendedEvent)[] = await (program.extendedEvent
    ? Bluebird.map(issue_events, event => getExtendedEvent(organisation, projectName, event.eventID), {
        concurrency: CONCURRENCY
      }).then(events => events.reduce((acc, val) => acc.concat(val), []))
    : Promise.resolve(issue_events));

  return events.map(formatEvent);
}

async function listIssueEvents(issue_id: number, max_page = 0, cursor: string | null = null): Promise<Event[]> {
  const path = `/issues/${issue_id}/events/`;

  const options: Partial<request.Options> = {};
  if (cursor) options.qs = { cursor };

  const { headers, body } = await fetch('GET', path, options);

  const events = body;
  const next_link_cursor = getCursor(findNextLink(headers.link));
  if (next_link_cursor && max_page !== 0) {
    return listIssueEvents(issue_id, --max_page, next_link_cursor).then(reponse => events.concat(reponse));
  }

  return events;
}

async function getExtendedEvent(
  organisation: string,
  project_name: string,
  event_id: string
): Promise<ExtendedEvent[]> {
  const path = `/projects/${organisation}/${project_name}/events/${event_id}/`;
  return (await fetch('GET', path)).body;
}

async function fetch(method: string, path: string, options?: Partial<request.Options>) {
  const params = {
    method: method,
    url: BASE_URI.clone()
      .segment(path)
      .normalize()
      .href(),
    headers: {
      Authorization: `Bearer ${SENTRY_API_TOKEN}`
    },
    json: true,
    resolveWithFullResponse: true,
    ...options
  };

  return await request(params);
}

function formatEvent(event: Event | ExtendedEvent): FormattedEvent {
  const tags = event.tags.reduce(
    (acc, pair) => {
      if (acc.hasOwnProperty(pair.key)) {
        if (!Array.isArray(acc[pair.key])) {
          acc[pair.key] = [acc[pair.key]];
        }

        acc[pair.key].push(pair.value);
      } else {
        acc[pair.key] = pair.value;
      }

      return acc;
    },
    {} as any
  );

  return {
    dateCreated: event.dateCreated,
    tags: tags,
    ...('context' in event && 'dateReceived' in event
      ? {
          dateReceived: event.dateReceived,
          context: event.context
        }
      : {})
  };
}

function findNextLink(link: string = ''): string {
  return link.split(',').filter(l => {
    const next = l.match(/rel="next"/);
    return next && next.length;
  })[0];
}

function getCursor(next_link: string): string | null {
  const next = next_link.match(/cursor="([a-zA-Z0-9:]*)"/);
  return next && next.length ? next[1] : null;
}

function validate(): void {
  if (!SENTRY_API_TOKEN) {
    console.log(
      `Please specify a SENTRY_API_TOKEN environment variable Visit https://github.com/busbud/get-sentry-event-data#setup for more information`
    );
  } else if (!eventId) {
    console.log(`You must specify an event ID`);
  } else if (program.extendedEvent && !(program.organisation && program.projectName)) {
    console.log(
      `You must specify an organisation and a project name and an organisation when using the extended event mode`
    );
  } else {
    return;
  }
  process.exit(1);
}

export interface Event {
  eventID: string;
  tags: Tags[];
  dateCreated: string;
}

export interface ExtendedEvent extends Event {
  dateReceived: string;
  context: {
    [k: string]: any;
  };
}

interface Tags {
  value: string;
  key: string;
  query?: string;
}

interface FormattedEvent {
  dateCreated: string;
  tags: any;
  dateReceived?: string;
  context?: any;
}
