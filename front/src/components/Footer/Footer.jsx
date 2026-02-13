import './Footer.scss';

export default function Footer() {
  return (
    <footer className="siteFooter">
      <div className="footerContent">
        <div className="footerBranding">
          <a className="footerBrandingLink" href="/" aria-label="MinutesMap home">
            <picture>
              <source type="image/avif" srcSet="/logo-70.avif 1x, /logo-140.avif 2x" />
              <source type="image/webp" srcSet="/logo-70.webp 1x, /logo-140.webp 2x" />
              <img
                src="/logo-70.png"
                srcSet="/logo-70.png 1x, /logo-140.png 2x"
                width="40"
                height="40"
                alt="MinutesMap logo"
                className="footerLogo"
              />
            </picture>
            <span className="footerName">MinutesMap</span>
          </a>
        </div>

        <nav className="footerLinks" aria-label="Footer">
          <ul className="footerLinkList">
            <li>
              <a href="/about">About</a>
            </li>
            <li>
              <a href="/privacy/">Privacy Policy</a>
            </li>
            <li>
              <a href="mailto:minutesmap.viz@gmail.com">Contact</a>
            </li>
            {/*
            <li>
              <a href="https://x.com/MinutesMap" target="_blank" rel="noopener noreferrer">
                Twitter / X
              </a>
            </li>
            */}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
