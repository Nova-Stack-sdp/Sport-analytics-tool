import { Router } from 'express';
import { fetchBarcelonaRaceRaw } from './openf1.js';

export const watchLiveRouter = Router();

// Fetched once and cached — the Barcelona 2026 race this feature simulates
// as "live" doesn't change, so there's no need to re-fetch it per request.
let Barcelona_openf1Data = null;

watchLiveRouter.get('/', async (req, res, next) => {
  try {
    if (!Barcelona_openf1Data) {
      Barcelona_openf1Data = await fetchBarcelonaRaceRaw();
    }
    res.json(Barcelona_openf1Data);
  } catch (err) {
    next(err);
  }
});

