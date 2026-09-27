import { useEffect, useState } from 'react';
import { getTelemetryTVRace, getTelemetryTVRaces } from '../api/client';
import LiveTicker from '../components/telemetry-tv/LiveTicker';
import Masterboard from '../components/telemetry-tv/Masterboard';
import PlaybackVideo from '../components/telemetry-tv/PlaybackVideo';
import PlaybackStatusBar from '../components/telemetry-tv/PlaybackStatusBar';
import RacePulse from '../components/telemetry-tv/RacePulse';
import RaceTimeline from '../components/telemetry-tv/RaceTimeline';
import TelemetryTVFooter from '../components/telemetry-tv/TelemetryTVFooter';
import { deriveIndycarLapState } from '../features/telemetry-tv/deriveIndycarLapState';

function TelemetryTVPage() {
  const [races, setRaces] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [raceData, setRaceData] = useState(null);
  const [raceLoading, setRaceLoading] = useState(false);
  const [raceError, setRaceError] = useState(null);
  const [lap, setLap] = useState(1);

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

  useEffect(() => {
    if (!selectedSlug) {
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
  }, [selectedSlug]);

  return (
    <div className="page" id="page-telemetry-tv">
      <div className="content">
        <div className="telemetry-tv-grid">
          <div className="telemetry-tv-primary">
            <PlaybackVideo
              race={selectedRace}
              races={races}
              selectedSlug={selectedSlug}
              onSelectRace={setSelectedSlug}
              loading={loading}
              error={error}
            />
            <PlaybackStatusBar
              race={raceData}
              lap={lap}
              leaderLap={lapState.leaderLap}
              onLapChange={setLap}
            />
            <LiveTicker events={[]} />
          </div>

          <div className="telemetry-tv-sidebar">
            <Masterboard
              race={raceData}
              lap={lap}
              leaderboard={lapState.leaderboard}
              loading={raceLoading}
              error={raceError}
            />
          </div>
        </div>

        <RacePulse race={raceData} />
        <RaceTimeline race={raceData} lap={lapState.lap || lap} />

        <TelemetryTVFooter />
      </div>
    </div>
  );
}

export default TelemetryTVPage;
