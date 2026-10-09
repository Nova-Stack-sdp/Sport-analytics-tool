import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTelemetryTVRace, getTelemetryTVRaces, getTelemetryTVWeather } from '../api/client';
import BattleRadar from '../components/telemetry-tv/BattleRadar';
import DriverStatsPanel from '../components/telemetry-tv/DriverStatsPanel';
import LeadBattle from '../components/telemetry-tv/LeadBattle';
import LiveTicker from '../components/telemetry-tv/LiveTicker';
import Masterboard from '../components/telemetry-tv/Masterboard';
import PlaybackVideo from '../components/telemetry-tv/PlaybackVideo';
import PlaybackStatusBar from '../components/telemetry-tv/PlaybackStatusBar';
import RaceFinishCard from '../components/telemetry-tv/RaceFinishCard';
import RaceHeaderBar from '../components/telemetry-tv/RaceHeaderBar';
import RaceInstruments from '../components/telemetry-tv/RaceInstruments';
import RaceOverview from '../components/telemetry-tv/RaceOverview';
import RacePickerBar from '../components/telemetry-tv/RacePickerBar';
import RaceStartWaitCard from '../components/telemetry-tv/RaceStartWaitCard';
import RaceTimeline from '../components/telemetry-tv/RaceTimeline';
import PhaseSection from '../components/telemetry-tv/PhaseSection';
import SectionDivider from '../components/telemetry-tv/SectionDivider';
import StrategyCard from '../components/telemetry-tv/StrategyCard';
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
import { buildStrategyModel } from '../features/telemetry-tv/strategyModel';
import { buildPaceGauge } from '../features/telemetry-tv/paceGauge';
import { buildMomentumModel } from '../features/telemetry-tv/momentumModel';
import { lapNarrationCandidates, raceStateContext } from '../features/telemetry-tv/lapNarration';
import { surname, videoCandidates } from '../features/telemetry-tv/narrator';
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
  // The narrator's material (see features/telemetry-tv/narrator.js). While
  // the player clock runs and the race carries video-stamped broadcast
  // events, it narrates those on the video clock; otherwise it narrates what
  // the lap chart shows, on the lap clock. Either way it weighs every moment
  // and says the most important unsaid one next.
  // Broadcast events already say what happened; each gains where the race
  // stood on its lap (lap of the race, leader, caution) as its context.
  const videoNarration = useMemo(
    () =>
      videoCandidates(raceData?.events).map((candidate) => ({
        ...candidate,
        context: raceStateContext(raceData, candidate.lap),
      })),
    [raceData]
  );
  const lapNarration = useMemo(
    () => lapNarrationCandidates(raceData, { lap: lapState.lap, isFinished: lapState.isFinished }),
    [raceData, lapState.lap, lapState.isFinished]
  );
  const onVideoClock = videoNarration.length > 0 && videoSeconds != null;
  const frontRunnerKey = (lapState.leaderboard ?? [])
    .filter((entry) => Number(entry.position) <= 3)
    .map((entry) => surname(entry.driverName))
    .sort()
    .join('|');
  const frontRunners = useMemo(
    () => new Set(frontRunnerKey ? frontRunnerKey.split('|') : []),
    [frontRunnerKey]
  );
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
  // The instrument band and the strategy rows read the same clipped lap set:
  // the pace needle, its colour band and the lap strip all stop at the lap the
  // broadcast has reached, and the momentum dial samples the published margin
  // over that same window.
  const paceGauge = buildPaceGauge(lapTrend, lap);
  const momentum = buildMomentumModel(lapTrend, lap);
  // Strategy / Tyre Analysis rows: tyre drift across the current green run,
  // laps since the last visible stop, and the selected lap against the
  // fastest so far — all clipped to the lap the broadcast has reached.
  const strategyModel = raceData
    ? buildStrategyModel({
      lapTrend,
      lap,
      cautions: lapState.visibleCautions ?? [],
      pitStops: (lapState.visiblePitStops ?? []).flatMap((entry) => (
        (entry.stops ?? []).map((stop) => ({ ...stop, car: entry.car, driver: entry.driver }))
      )),
    })
    : null;
  // The race header reads the same distance the dashboards do once the
  // report has landed; before that it names the field from the catalogue
  // entry and holds the lap readout on dashes.
  const headerLapLabel = raceData && lapState.totalLaps
    ? `LAP ${Math.min(lap, lapState.totalLaps)} / ${lapState.totalLaps}`
    : `LAP -- / ${selectedRace?.totalLaps ?? '--'}`;

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

  // Race-day weather loads with the pick itself, not with playback: it
  // describes the day, so the header can show it before the green flag.
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    setWeather(null);
    if (!selectedSlug) return undefined;
    let cancelled = false;
    getTelemetryTVWeather(selectedSlug)
      .then((data) => {
        if (!cancelled) setWeather(data?.weather ?? null);
      })
      .catch(() => {
        // No reading, no conditions — the header simply leaves them out.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

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
        {/* Navigation */}
        <RacePickerBar
          races={races}
          selectedSlug={selectedSlug}
          onSelectRace={handleRaceSelect}
          loading={loading}
        />
        {selectedRace ? (
          <>
            {/* Race header: who is racing, how far in, under which flag. */}
            <RaceHeaderBar
              race={selectedRace}
              lapLabel={headerLapLabel}
              flag={lapState.leaderLap?.flag ?? null}
              fieldSize={selectedRace.fieldSize}
              weather={weather}
            />

            {/* The three race phases fold away from their own chapter marks
                (see PhaseSection), so a viewer keeps the layer they came for. */}
            <PhaseSection step="01" label="Live observation">
              {/* Observation layer: the broadcast beside the live order. */}
              <div className="telemetry-tv-grid">
                <div className="telemetry-tv-primary">
                  <div className="ttv-band-label">Live Broadcast</div>
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
                        lapTrend={lapTrend}
                        onLapChange={handleLapChange}
                      />
                      {/* The narrator's crawl, right under the broadcast it
                          narrates (see LiveTicker and narrator.js). */}
                      <LiveTicker
                        candidates={onVideoClock ? videoNarration : lapNarration}
                        now={onVideoClock ? videoSeconds : lapState.lap}
                        scale={onVideoClock ? 1 : 1 / 40}
                        frontRunners={frontRunners}
                        label={lapState.lap ? `LAP ${lapState.lap}` : null}
                      />
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
                    <div className="ttv-band-label">Live Order</div>
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
            </PhaseSection>

            {dashboardsLive && (
              <>
                <PhaseSection step="02" label="Now we move from observation to analysis">
                  {/* Analysis layer: the radar frames the fight first, the
                      instrument dials answer "how fast and which way" second, and
                      strategy then reads the same laps at full width. All three
                      fold away from their own heads too. */}
                  <BattleRadar
                    model={battleRadar}
                    context={selectedSlug === 'toronto-2025' ? torontorace.context : null}
                  />
                  <RaceInstruments
                    pace={paceGauge}
                    momentum={momentum}
                  />
                  <StrategyCard
                    strategy={strategyModel}
                    raceIntelligence={raceIntelligence}
                  />
                </PhaseSection>

                <PhaseSection step="03" label="Deeper investigation">
                  {/* Deeper layer: how the race unfolded — the lead stretches,
                      the caution windows and the pit-stop rhythm. The
                      after-the-flag answers follow, outside the fold. */}
                  <LeadBattle
                    leadBattle={leadBattle}
                    lap={lap}
                    isFinished={lapState.isFinished}
                  />
                  <RaceTimeline race={raceData} lapState={lapState} />
                </PhaseSection>

                {lapState.isFinished && (
                  <>
                    <SectionDivider step="04" label="Checkered-flag answers" />
                    <RaceFinishCard finishSummary={finishSummary} totalLaps={lapState.totalLaps} />
                    <RaceOverview overview={raceOverview} />
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <TelemetryTVGuide error={error} />
        )}

        <TelemetryTVFooter />
      </div>
    </div>
  );
}

export default TelemetryTVPage;
