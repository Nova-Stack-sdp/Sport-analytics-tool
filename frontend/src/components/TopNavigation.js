import { NavLink } from 'react-router-dom';

function TopNavigation() {
  return (
    <nav className="top-navigation" aria-label="Main navigation">
      <NavLink to="/">Overview</NavLink>
      <NavLink to="/sign-in">Sign in</NavLink>
    </nav>
  );
}

export default TopNavigation;
