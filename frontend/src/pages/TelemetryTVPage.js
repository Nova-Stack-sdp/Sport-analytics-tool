import { useCallback, useEffect, useRef, useState } from 'react';
import { getTelemetryTVRace, getTelemetryTVRaces } from '../api/client';
import BattleRadar from '../components/telemetry-tv/BattleRadar';
import LiveTicker from '../components/telemetry-tv/LiveTicker';
import Masterboard from '../components/telemetry-tv/Masterboard';
import PlaybackVideo from '../components/telemetry-tv/PlaybackVideo';
import PlaybackStatusBar from '../components/telemetry-tv/PlaybackStatusBar';
import RacePulse from '../components/telemetry-tv/RacePulse';
import RaceTimeline from '../components/telemetry-tv/RaceTimeline';
import RaceWeatherPanel from '../components/telemetry-tv/RaceWeatherPanel';
import TelemetryTVFooter from '../components/telemetry-tv/TelemetryTVFooter';
import { deriveIndycarLapState } from '../features/telemetry-tv/deriveIndycarLapState';
import { lapFromVideoSeconds, videoSecondsForLap } from '../features/telemetry-tv/videoToLap';
import { buildBattleRadarModel } from '../features/telemetry-tv/buildBattleRadarModel';
import { buildMasterboardCommentary } from '../features/telemetry-tv/buildMasterboardCommentary';
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
        setSelectedSlug(list.length > 0 ? list[0].slug : '');
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
  const commentaryEvents = buildMasterboardCommentary(raceData, lapState);

  const handleVideoTime = useCallback((seconds) => {
    setVideoSeconds(Math.floor(seconds));
  }, []);

  // Follow mode: the lap cursor tracks the player's clock, so every metric on
  // the page reflects whatever the video is showing.
  useEffect(() => {
    if (!raceData || videoSeconds == null) return;
    if (Date.now() < suppressVideoFollowUntilRef.current) return;
    const mappedLap = lapFromVideoSeconds(raceData, videoSeconds);
    if (mappedLap == null) return;
    setLap((current) => (current === mappedLap ? current : mappedLap));
  }, [raceData, videoSeconds]);

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
        <div className="telemetry-tv-grid">
          <div className="telemetry-tv-primary">
            <PlaybackVideo
              ref={videoRef}
              race={selectedRace}
              races={races}
              selectedSlug={selectedSlug}
              onSelectRace={handleRaceSelect}
              onPlay={() => setPlaybackStarted(true)}
              onVideoTime={handleVideoTime}
              playbackStarted={playbackStarted}
              loading={loading}
              error={error}
            />
            <PlaybackStatusBar
              race={raceData}
              lap={lap}
              videoSeconds={videoSeconds}
              leaderLap={lapState.leaderLap}
              onLapChange={handleLapChange}
            />
            <LiveTicker events={commentaryEvents} />
          </div>

          <div className="telemetry-tv-sidebar">
            <Masterboard
              race={raceData}
              lap={lap}
              isFinished={lapState.isFinished}
              leaderboard={lapState.leaderboard}
              loading={raceLoading}
              error={raceError}
            />
          </div>
        </div>

        {raceIntelligence && (
          <RaceWeatherPanel
            raceSlug={selectedSlug}
            weather={raceIntelligence.weather}
            strategySignals={raceIntelligence.strategySignals}
            narrative={raceIntelligence.narrative}
          />
        )}
        <BattleRadar
          model={battleRadar}
          context={selectedSlug === 'toronto-2025' ? torontorace.context : null}
        />
        <RacePulse race={raceData} lapState={lapState} />
        <RaceTimeline race={raceData} lapState={lapState} />

        <TelemetryTVFooter />
      </div>
    </div>
  );
}

export default TelemetryTVPage;
