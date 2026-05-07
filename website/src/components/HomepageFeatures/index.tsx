import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: ReactNode;
  description: ReactNode;
};

const ShieldIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.featureIcon}>
    <path
      d="M24 4L8 10v14c0 9.4 6.8 18.2 16 20 9.2-1.8 16-10.6 16-20V10L24 4z"
      fill="rgba(229,57,53,0.15)"
      stroke="#e53935"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M18 24l4 4 8-8"
      stroke="#e53935"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BadgeIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.featureIcon}>
    <rect x="6" y="16" width="36" height="16" rx="4" fill="rgba(229,57,53,0.15)" stroke="#e53935" strokeWidth="2" />
    <rect x="6" y="16" width="14" height="16" rx="4" fill="rgba(229,57,53,0.3)" />
    <line x1="24" y1="20" x2="38" y2="20" stroke="#e53935" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="28" x2="34" y2="28" stroke="#e53935" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    <circle cx="13" cy="24" r="3" fill="#e53935" />
  </svg>
);

const ChartIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.featureIcon}>
    <rect x="6" y="30" width="6" height="12" rx="2" fill="rgba(229,57,53,0.4)" stroke="#e53935" strokeWidth="1.5" />
    <rect x="15" y="22" width="6" height="20" rx="2" fill="rgba(229,57,53,0.55)" stroke="#e53935" strokeWidth="1.5" />
    <rect x="24" y="14" width="6" height="28" rx="2" fill="rgba(229,57,53,0.7)" stroke="#e53935" strokeWidth="1.5" />
    <rect x="33" y="8" width="6" height="34" rx="2" fill="#e53935" stroke="#e53935" strokeWidth="1.5" />
    <line x1="4" y1="42" x2="44" y2="42" stroke="#e53935" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
  </svg>
);

const FeatureList: FeatureItem[] = [
  {
    title: 'No API Key Storage',
    icon: <ShieldIcon />,
    description: (
      <>
        Burnbadge never stores your provider API keys. Your GitHub Actions
        workflow fetches usage directly and pushes it to Burnbadge — keeping
        your credentials safe.
      </>
    ),
  },
  {
    title: 'Beautiful Badges',
    icon: <BadgeIcon />,
    description: (
      <>
        Generate Shields.io-compatible badges for your README. Show your
        AI spending with customizable colors, labels, and styles — embedding
        is a single line of Markdown.
      </>
    ),
  },
  {
    title: 'Spending Charts',
    icon: <ChartIcon />,
    description: (
      <>
        Visualize your usage over time with pure SVG bar charts. See daily
        breakdowns by model and track spending trends across up to 366 days.
      </>
    ),
  },
];

function Feature({title, icon, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.featureCard}>
        <div className={styles.featureIconWrap}>{icon}</div>
        <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
        <p className={styles.featureDescription}>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
