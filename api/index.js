// api/freebusy.js
import 'dotenv/config';
import dav from 'dav';
import ical from 'ical';
import { RRule } from 'rrule';

const ICLOUD_ID = process.env.ICLOUD_ID;
const ICLOUD_APP_PASSWORD = process.env.ICLOUD_APP_PASSWORD;

if (!ICLOUD_ID || !ICLOUD_APP_PASSWORD) {
  throw new Error("ICLOUD_ID or ICLOUD_APP_PASSWORD not set in .env");
}

// Кэш на 5 минут (в памяти функции, может сбрасываться между вызовами)
let cachedRawEvents = [];
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

async function fetchRawEventsFromiCloud() {
  const xhr = new dav.transport.Basic(
    new dav.Credentials({ username: ICLOUD_ID, password: ICLOUD_APP_PASSWORD })
  );

  const account = await dav.createAccount({
    server: 'https://caldav.icloud.com/',
    xhr,
    loadCollections: true,
    loadObjects: true
  });

  const events = [];

  for (const cal of account.calendars) {
    for (const obj of cal.objects) {
      try {
        let icsString;

        if (Buffer.isBuffer(obj.data)) icsString = obj.data.toString();
        else if (typeof obj.data === 'string') icsString = obj.data;
        else if (obj.data?.props)
          icsString = Object.values(obj.data.props).find(
            v => typeof v === 'string' && v.startsWith('BEGIN:VCALENDAR')
          );

        if (!icsString) continue;

        const parsed = ical.parseICS(icsString);
        Object.values(parsed).forEach(ev => {
          if (ev.type === 'VEVENT') {
            ev.calendarName = cal.displayName || 'default';
            events.push(ev);
          }
        });
      } catch (err) {
        console.error('Failed to parse event:', err);
      }
    }
  }

  return events;
}

function expandEvent(ev, startDate, endDate) {
  const instances = [];

  if (ev.rrule) {
    const rule = RRule.fromString(ev.rrule.toString(), { dtstart: ev.start });
    const between = rule.between(startDate, endDate, true);
    between.forEach(dt => {
      const duration = ev.end - ev.start;
      instances.push({
        start: new Date(dt).toISOString(),
        end: new Date(dt.getTime() + duration).toISOString(),
        title: 'Busy'
      });
    });
  } else {
    if (ev.end >= startDate && ev.start <= endDate) {
      instances.push({
        start: ev.start.toISOString(),
        end: ev.end.toISOString(),
        title: 'Busy'
      });
    }
  }

  return instances;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required (ISO strings)' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    // обновляем кэш, если устарел
    if (Date.now() - lastFetch > CACHE_TTL) {
      cachedRawEvents = await fetchRawEventsFromiCloud();
      lastFetch = Date.now();
    }

    const busy = [];
    cachedRawEvents.forEach(ev => {
      busy.push(...expandEvent(ev, startDate, endDate));
    });

    res.status(200).json({ busy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to fetch events', detail: err.message });
  }
}

