import { useCallback, useEffect, useRef, useState } from 'react';
import { getTelemetryTVRace, getTelemetryTVRaces } from '../api/client';
import BattleRadar from '../components/telemetry-tv/BattleRadar';
import DriverStatsPanel from '../components/telemetry-tv/DriverStatsPanel';
import LeadBattle from '../components/telemetry-tv/LeadBattle';
import LiveTicker from '../components/telemetry-tv/LiveTicker';
import Masterboard from '../components/telemetry-tv/Masterboard';
import PlaybackVideo from '../components/telemetry-tv/PlaybackVideo';
import PlaybackStatusBar from '../components/telemetry-tv/PlaybackStatusBar';
import RaceFinishCard from '../components/telemetry-tv/RaceFinishCard';
import RaceOverview from '../components/telemetry-tv/RaceOverview';
import RacePaceCard from '../components/telemetry-tv/RacePaceCard';
import RacePickerBar from '../components/telemetry-tv/RacePickerBar';
import RaceStartWaitCard from '../components/telemetry-tv/RaceStartWaitCard';
import RaceTimeline from '../components/telemetry-tv/RaceTimeline';
import RaceWeatherPanel from '../components/telemetry-tv/RaceWeatherPanel';
import TelemetryTVFooter from '../components/telemetry-tv/TelemetryTVFooter';
import TelemetryTVGuide from '../components/telemetry-tv/TelemetryTVGuide';
import { deriveIndycarLapState } from '../features/telemetry-tv/deriveIndycarLapState';
import {
  lapFromVideoSeconds,
  raceStartVideoSeconds,
  videoSecondsForLap,
} from '../features/telemetry-tv/videoToLap';
import {
  buildDriverStats,
  buildFinishSummary,
  buildLapTrend,
  marginDelta,
} from '../features/telemetry-tv/raceAnalytics';
import { buildBattleRadarModel } from '../features/telemetry-tv/buildBattleRadarModel';
import { buildLeadBattle, buildRaceOverview } from '../features/telemetry-tv/raceStats';
import { buildMasterboardCommentary } from '../features/telemetry-tv/buildMasterboardCommentary';
import { pickVideoTickerEvent } from '../features/telemetry-tv/videoTicker';
import { buildTorontoraceIntelligence } from '../features/telemetry-tv/Torontorace';

function TelemetryTVPage() {
  const [races, setRaces] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [raceData, setRaceData] = useState(null);
  const [raceLoading, setRaceLoading] = useState(false);
  const [raceError, setRaceError] = useState(null);
  const [lap, setLap] = useState(1);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [videoSeconds, setVideoSeconds] = useState(null);
  // Whether the video clock has reached the green flag — the dashboards stay
  // dark before it, however far into the broadcast the player is. With no
  // known race start (uncalibrated race) this is true from the first reading
  // so those races keep the always-on behaviour.
  const [raceStarted, setRaceStarted] = useState(false);
  const videoRef = useRef(null);
  // Seeking takes a moment to land; readings that arrive right after a slider
  // seek are ignored so they cannot yank the cursor back to the old lap.
  const suppressVideoFollowUntilRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getTelemetryTVRaces()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.races) ? data.races : [];
        setRaces(list);
        // selectedSlug already starts empty, so the page opens on the guide;
        // deliberately NOT reset here — a pick made while the catalogue was
        // still in flight must survive the catalogue landing.
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRace = races.find((race) => race.slug === selectedSlug) ?? null;
  const lapState = deriveIndycarLapState(raceData, lap);
  const battleRadar = buildBattleRadarModel(lapState.leaderboard);
  const torontorace = buildTorontoraceIntelligence({ lapState, selectedSlug });
  const raceIntelligence = raceData?.intelligence ?? (selectedSlug === 'toronto-2025' ? torontorace : null);
  // The broadcast's green-flag moment, once the race report has landed. Races
  // that ship no calibration have no known start to wait for and stay
  // always-on, exactly as before.
  const raceStartSeconds = raceData ? raceStartVideoSeconds(raceData) : null;
  // The dashboards wake at the green flag and go dark again whenever the
  // player is scrubbed back into the build-up — they answer to the video
  // clock, not to time passing.
  const dashboardsLive = raceData != null && (raceStartSeconds == null || raceStarted);
  const commentaryEvents = buildMasterboardCommentary(raceData, lapState);
  // While the player clock is live the ticker narrates the curated broadcast
  // timeline; before that it cycles the lap-based commentary.
  const videoTickerEvent = pickVideoTickerEvent(raceData?.events, videoSeconds);
  const tickerEvents = videoTickerEvent ? [videoTickerEvent] : commentaryEvents;
  const lapTrend = buildLapTrend(raceData);
  const driverStats = buildDriverStats(raceData);
  const margin = marginDelta(raceData, lap);
  const finishSummary = raceData && lapState.isFinished ? buildFinishSummary(raceData) : null;
  // Official race-report numbers the payload already carries: the overview
  // band and the lead-stretch chart both read straight from the API facts.
  // The lead battle replays as it stood at the current lap — final answers
  // (the overview band, the full classification) wait for the checkered flag.
  const raceOverview = raceData ? buildRaceOverview(raceData) : null;
  const leadBattle = raceData
    ? buildLeadBattle(raceData, lapState.isFinished ? null : lap)
    : null;

  const handleVideoTime = useCallback((seconds) => {
    setVideoSeconds(Math.floor(seconds));
  }, []);

  // Follow mode: the lap cursor tracks the player's clock, so every metric on
  // the page reflects whatever the video is showing.
  useEffect(() => {
    if (!raceData || videoSeconds == null) return;
    // The gate follows the clock too — including backwards: scrubbing into
    // the pre-race build-up parks the dashboards again.
    if (raceStartSeconds != null) {
      setRaceStarted(videoSeconds >= raceStartSeconds);
    }
    if (Date.now() < suppressVideoFollowUntilRef.current) return;
    const mappedLap = lapFromVideoSeconds(raceData, videoSeconds);
    if (mappedLap == null) return;
    setLap((current) => (current === mappedLap ? current : mappedLap));
  }, [raceData, videoSeconds, raceStartSeconds]);

  function handleLapChange(nextLap) {
    setLap(nextLap);
    if (!raceData) return;
    const seconds = videoSecondsForLap(raceData, nextLap);
    if (seconds == null) return;
    suppressVideoFollowUntilRef.current = Date.now() + 2500;
    videoRef.current?.seekTo(seconds);
  }

  function handleRaceSelect(slug) {
    setSelectedSlug(slug);
    setPlaybackStarted(false);
    setRaceData(null);
    setRaceError(null);
    setRaceLoading(false);
    setLap(1);
    setVideoSeconds(null);
    setRaceStarted(false);
    suppressVideoFollowUntilRef.current = 0;
  }

  useEffect(() => {
    if (!selectedSlug || !playbackStarted) {
      setRaceData(null);
      setRaceLoading(false);
      return undefined;
    }

    let cancelled = false;
    setRaceData(null);
    setRaceError(null);
    setRaceLoading(true);
    setLap(1);
    getTelemetryTVRace(selectedSlug)
      .then((data) => {
        if (!cancelled) setRaceData(data?.race ?? null);
      })
      .catch((err) => {
        if (!cancelled) setRaceError(err.message);
      })
      .finally(() => {
        if (!cancelled) setRaceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug, playbackStarted]);

  return (
    <div className="page" id="page-telemetry-tv">
      <div className="content">
        <RacePickerBar
          races={races}
          selectedSlug={selectedSlug}
          onSelectRace={handleRaceSelect}
          loading={loading}
        />
        {selectedRace ? (
          <div className="telemetry-tv-grid">
            <div className="telemetry-tv-primary">
              <PlaybackVideo
                ref={videoRef}
                race={selectedRace}
                onPlay={() => setPlaybackStarted(true)}
                onVideoTime={handleVideoTime}
                playbackStarted={playbackStarted}
                loading={loading}
                error={error}
              />
              {dashboardsLive ? (
                <>
                  <PlaybackStatusBar
                    race={raceData}
                    lap={lap}
                    videoSeconds={videoSeconds}
                    margin={margin}
                    leaderLap={lapState.leaderLap}
                    onLapChange={handleLapChange}
                  />
                  <LiveTicker events={tickerEvents} />
                  <RacePaceCard lapTrend={lapTrend} lap={lap} />
                </>
              ) : (
                /* The broadcast has not reached the green flag: no stats are
                   loaded into view — every dashboard waits for the race. */
                <RaceStartWaitCard
                  loading={raceLoading}
                  error={raceError}
                  videoSeconds={videoSeconds}
                  raceStartSeconds={raceStartSeconds}
                />
              )}
            </div>

            {dashboardsLive && (
              <div className="telemetry-tv-sidebar">
                {/* The running order is live commentary; the official final
                    classification below it is an after-the-flag answer, so
                    it waits for the checkered flag. */}
                <Masterboard
                  race={raceData}
                  lap={lap}
                  isFinished={lapState.isFinished}
                  leaderboard={lapState.leaderboard}
                  loading={raceLoading}
                  error={raceError}
                />
                {lapState.isFinished && <DriverStatsPanel driverStats={driverStats} />}
              </div>
            )}
          </div>
        ) : (
          <TelemetryTVGuide error={error} />
        )}

        {dashboardsLive && (
          <>
            {/* Live phase: the battle for position is the story — Battle
                Radar leads, the lead battle and the race sequence follow.
                Final answers (the race overview band) wait for the flag. */}
            <BattleRadar
              model={battleRadar}
              context={selectedSlug === 'toronto-2025' ? torontorace.context : null}
            />
            {raceIntelligence && (
              <RaceWeatherPanel
                raceSlug={selectedSlug}
                weather={raceIntelligence.weather}
                strategySignals={raceIntelligence.strategySignals}
                narrative={raceIntelligence.narrative}
              />
            )}
            <LeadBattle
              leadBattle={leadBattle}
              lap={lap}
              isFinished={lapState.isFinished}
            />
            <RaceTimeline race={raceData} lapState={lapState} />

            {/* Report phase: once the checkered flag lands, the final
                answers take over — the podium first, then the race-level
                numbers and the full classification. */}
            {lapState.isFinished && (
              <>
                <RaceFinishCard finishSummary={finishSummary} totalLaps={lapState.totalLaps} />
                <RaceOverview overview={raceOverview} />
              </>
            )}
          </>
        )}

        <TelemetryTVFooter />
      </div>
    </div>
  );
}

export default TelemetryTVPage;
