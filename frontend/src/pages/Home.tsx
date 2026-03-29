const whatItFeatures = [
  {
    index: '01',
    title: 'Multiple Algorithms',
    bullets: ['Linear models', 'Ensemble learning models', 'Kernel-based models', 'Instance-based learning models','Spline-based models'],
  },
  {
    index: '02',
    title: 'Easy Task',
    bullets: ['Online input parameters', 'Import multiple local solutions'],
  },
  {
    index: '03',
    title: 'High Accuracy',
    bullets: ['10-k cross-validation', 'Bayesian optimization', 'high R² and low RSME'],
  },
  {
    index: '04',
    title: 'Design Guidance',
    bullets: ['SHAP-based explanation analysis', 'Reverse design scheme'],
  },
]

const whatItDoes = [
  {
    key: 'prediction',
    title: 'Performance Prediction',
    description:
      'Predict the protective performance of product cushioning packaging.',
  },
  {
    key: 'optimization',
    title: 'Design Optimization Guidance',
    description:
      'Provide guidance to optimize cushioning packaging design and improve protection effectiveness.',
  },
]

const sponsors = [
  {
    name: 'VSCode',
    logo: '/sponsors/vscode.svg',
    website: 'https://code.visualstudio.com/',
    logoAlt: 'Visual Studio Code logo',
  },
  {
    name: 'Codex',
    logo: '/sponsors/codex.png',
    website: 'https://openai.com/codex/',
    logoAlt: 'Codex logo',
  },
  {
    name: 'GitHub',
    logo: '/sponsors/github.svg',
    website: 'https://github.com/',
    logoAlt: 'GitHub logo',
  },
  {
    name: 'React',
    logo: '/sponsors/react.webp',
    website: 'https://react.dev/',
    logoAlt: 'React logo',
  },
  {
    name: 'TypeScript',
    logo: '/sponsors/typescript.png',
    website: 'https://www.typescriptlang.org/',
    logoAlt: 'TypeScript logo',
  },
  {
    name: 'Vite',
    logo: '/sponsors/vite.svg',
    website: 'https://vite.dev/',
    logoAlt: 'Vite logo',
  },
]

export default function HomeUI() {
  return (
    <section className="page home-page home-page--immersive home-stage">
      <div className="home-stage__halo" aria-hidden="true" />
      <div className="home-stage__constellation" aria-hidden="true" />

      <div className="home-stage__hero">
        <div className="home-hero__content">
          <div className="home-hero__eyebrow">Cushion Packaging Evaluation Studio</div>
          <h1 className="home-hero__title">CushionPack Studio</h1>
          <p className="home-hero__tagline">
            THE PLATFORM THAT EVALUATES CUSHIONING PACKAGING PERFORMANCE.
          </p>
        </div>
      </div>
      <div className="home-stage__divider" aria-hidden="true" />

      <div className="home-stage__story">
        <div className="home-does">
          <div className="home-stage__title-row">
            <span className="home-stage__marker" aria-hidden="true" />
            <h5 className="home-stage__title">What it does</h5>
          </div>

          <div className="home-does__grid">
            {whatItDoes.map((item) => (
              <article key={item.key} className="home-does-card">
                <div className="home-does-card__icon" aria-hidden="true">
                  {item.key === 'prediction' ? (
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M4 19V5" />
                      <path d="M4 19H20" />
                      <path d="M8 15L12 11L15 13L20 8" />
                      <path d="M17 8H20V11" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M4 7H14" />
                      <path d="M17 7H20" />
                      <path d="M4 17H7" />
                      <path d="M10 17H20" />
                      <circle cx="15.5" cy="7" r="1.8" />
                      <circle cx="8.5" cy="17" r="1.8" />
                    </svg>
                  )}
                </div>
                <h3 className="home-does-card__title">{item.title}</h3>
                <p className="home-does-card__description">{item.description}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="home-stage__header">
          <div className="home-stage__title-row">
            <span className="home-stage__marker" aria-hidden="true" />
            <h5 className="home-stage__title">What it features</h5>
          </div>
        </div>

        <div className="home-feature-stack">
          {whatItFeatures.map((feature, index) => (
            <article
              key={feature.title}
              className={`home-feature-panel ${index % 2 === 1 ? 'home-feature-panel--accent' : ''}`}
            >
              <div className="home-feature-panel__top">
                <div className="home-feature-panel__index">{feature.index}</div>
                <h3 className="home-feature-panel__title">{feature.title}</h3>
              </div>
              <ul className="home-feature-panel__list">
                {feature.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="home-sponsors">
          <div className="home-sponsors__heading">
            <span className="home-sponsors__chevron" aria-hidden="true">
              &rsaquo;
            </span>
            <h5 className="home-sponsors__title">Developed based</h5>
          </div>

          <div className="home-sponsors__grid">
            {sponsors.map((sponsor) => (
              <a
                key={sponsor.name}
                href={sponsor.website}
                className="home-sponsor-card"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="home-sponsor-card__logo"
                  src={sponsor.logo}
                  alt={sponsor.logoAlt}
                  loading="lazy"
                />
                <span className="home-sponsor-card__name">{sponsor.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
