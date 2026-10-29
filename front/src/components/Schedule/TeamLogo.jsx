import { ASSET_PREFIX } from '../../environment';
import { useLoadedImage } from '../hooks/ui/useLoadedImage';

const LOGO_BASE_PATH = `${ASSET_PREFIX ? ASSET_PREFIX : ''}/img/teams`;
const buildLogoSrc = (team) => `${LOGO_BASE_PATH}/${team}.svg`;

export default function TeamLogo({ team, size = 16 }) {
  const { isLoaded, imgProps } = useLoadedImage(team ? buildLogoSrc(team) : null);

  if (!team) return null;

  return (
    <div className={`teamLogoWrapper${!isLoaded ? ' isPending' : ''}`}>
      <img
        {...imgProps}
        height={size}
        width={size}
        draggable={false}
        loading="lazy"
        className="teamLogo"
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}
