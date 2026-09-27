import { useEffect, useState } from 'react';
import { getTelemetryTVRaces } from '../api/client';
import LiveTicker from '../components/telemetry-tv/LiveTicker';
import Masterboard from '../components/telemetry-tv/Masterboard';
import PlaybackVideo from '../components/telemetry-tv/PlaybackVideo';
import SessionSetupBar from '../components/telemetry-tv/SessionSetupBar';
import PlaybackStatusBar from '../components/telemetry-tv/PlaybackStatusBar';
import BattleRadar from '../components/telemetry-tv/BattleRadar';
import RacePulse from '../components/telemetry-tv/RacePulse';
import TelemetryTVFooter from '../components/telemetry-tv/TelemetryTVFooter';

function TelemetryTVPage() {
  const [races, setRaces] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const leaderboard = [];

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

  return (
    <div className="page" id="page-telemetry-tv">
      <div className="content">
        <SessionSetupBar
          races={races}
          selectedSlug={selectedSlug}
          onSelectRace={setSelectedSlug}
          loading={loading}
        />

        <div className="telemetry-tv-grid">
          <div className="telemetry-tv-primary">
            <PlaybackVideo race={selectedRace} loading={loading} error={error} />
            <PlaybackStatusBar state={null} />
            <LiveTicker events={[]} />
          </div>

          <div className="telemetry-tv-sidebar">
            <Masterboard leaderboard={leaderboard} />
          </div>
        </div>

        <RacePulse leaderboard={leaderboard} />

        <BattleRadar leaderboard={leaderboard} />

        <TelemetryTVFooter />
      </div>
    </div>
  );
}

export default TelemetryTVPage;
