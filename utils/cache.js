import fetch from 'node-fetch';
import { Cache } from '../models/index.js';
import { CACHE_TTL, getCurrentTimeInNepal } from '../config/constants.js';

export async function fetchWithCache(key, url) {
  // Check if we have fresh data in the database
  const cachedData = await Cache.findOne({ key });
  const now = getCurrentTimeInNepal();

  if (cachedData && (now - cachedData.timestamp) < CACHE_TTL) {
    return cachedData.data;
  }

  // Fetch fresh data
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const data = await res.json();

  // Update the database with fresh data
  await Cache.findOneAndUpdate(
    { key },
    { data, timestamp: now },
    { upsert: true }
  );

  return data;
}