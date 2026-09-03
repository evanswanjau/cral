import { P } from "./styles.js";
import { ProfileMenu } from "./ProfileMenu.js";

export function AppHeader({
  name,
  company,
  email,
  approved,
}: {
  name: string;
  company: string | null;
  email: string;
  approved: boolean;
}): JSX.Element {
  return (
    <div style={P.topBar}>
      <div style={P.topBarInner}>
        <div style={P.topBarLeft}>
          <img src="/logo.png" alt="Cruz Ride Auto Limited" style={P.logo} />
          <span style={P.topBarRule} />
          <span style={P.portalLabel}>MERCHANT PORTAL</span>
          <span style={P.skewRule} />
        </div>
        <div style={P.topBarRight}>
          <a href="https://wa.me/254733376061?text=Hi%20CRAL" target="_blank" rel="noreferrer" style={P.helpLink}>
            Help
          </a>
          <span style={P.topBarRuleThin} />
          <ProfileMenu name={name} company={company} email={email} approved={approved} />
        </div>
      </div>
    </div>
  );
}
