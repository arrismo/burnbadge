import React, {useState, type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import HomepageFeatures from '../components/HomepageFeatures';

import styles from './index.module.css';

interface ProjectResponse {
  token: string;
  badgeToken: string;
  usageToken: string;
  badgeUrl: string;
  chartUrl: string;
  usageUrl: string;
}

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'mock', label: 'Mock (for testing)' },
] as const;

function CreateProjectForm() {
  const [provider, setProvider] = useState<string>('openrouter');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({provider}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as {error?: string}).error || `HTTP ${response.status}`);
      }
      setResult(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={styles.createSection}>
      <Heading as="h2" className={styles.createTitle}>
        Create a Project
      </Heading>
      <p className={styles.createSubtitle}>
        Select your AI provider and generate your tokens instantly. No signup required.
      </p>

      <div className={styles.formCard}>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label htmlFor="provider">AI Provider</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={loading}
              className={styles.select}>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <button
            className={clsx('button button--primary button--lg', styles.createBtn)}
            onClick={handleCreate}
            disabled={loading}>
            {loading ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert--danger" role="alert" style={{marginTop: '1rem'}}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className={styles.result}>
          <p className={styles.resultSuccess}>✓ Your project is ready!</p>

          <div className={styles.tokens}>
            <div className={styles.tokenRow}>
              <span className={styles.tokenLabel}>
                Badge Token <span className={styles.tokenHint}>(public)</span>
              </span>
              <code className={styles.tokenValue}>{result.badgeToken}</code>
              <button
                className="button button--sm button--secondary"
                onClick={() => copy(result.badgeToken, 'badge')}>
                {copied === 'badge' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className={styles.tokenRow}>
              <span className={styles.tokenLabel}>
                Usage Token <span className={styles.tokenHint}>(private)</span>
              </span>
              <code className={styles.tokenValue}>{result.usageToken}</code>
              <button
                className="button button--sm button--secondary"
                onClick={() => copy(result.usageToken, 'usage')}>
                {copied === 'usage' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={styles.urls}>
            {[
              {label: 'Badge URL', url: result.badgeUrl},
              {label: 'Chart URL', url: result.chartUrl},
              {label: 'Usage URL', url: result.usageUrl},
            ].map(({label, url}) => (
              <div key={label} className={styles.urlRow}>
                <span>{label}</span>
                <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
              </div>
            ))}
          </div>

          <div className={styles.nextSteps}>
            <p className={styles.nextStepsTitle}>Next steps</p>
            <ol>
              <li>Save your tokens — you won't see the usage token again.</li>
              <li>
                Add them to GitHub Secrets as{' '}
                <code>BURNBADGE_BADGE_TOKEN</code> and <code>BURNBADGE_USAGE_TOKEN</code>.
              </li>
              <li>
                Set up the GitHub Actions workflow — see the{' '}
                <Link to="/docs/intro">Getting Started guide</Link>.
              </li>
              <li>
                Add the badge to your README:
                <pre className={styles.codeBlock}>{`![${provider} spend](${result.badgeUrl})`}</pre>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className="container">
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          Open Source · Self-hostable · No signup required
        </div>
        <Heading as="h1" className={styles.heroTitle}>
          {siteConfig.title}
        </Heading>
        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
        <div className={styles.heroPreview}>
          <span className={styles.previewLabel}>Live badge example:</span>
          <img
            src={
              'https://img.shields.io/endpoint?' +
              'url=https%3A%2F%2Fburnbadge.mikaelmoise00.workers.dev' +
              '%2Fapi%2Fbadge%2Fd4b1e6f2-7c3a-4b9e-8f1d-2e5a3c6b9d0e' +
              '&label=AI+Spend+%2830d%29&color=red'
            }
            alt="AI spend badge example"
            className={styles.shieldsBadge}
          />
        </div>
        <div className={styles.buttons}>
          <Link
            className={clsx('button button--outline button--lg', styles.btnOutline)}
            to="/docs/intro">
            Read the Docs
          </Link>
        </div>
      </div>
    </header>
  );
}

function InstallSection() {
  const [copied, setCopied] = useState(false);
  const installCommand =
    'curl -fsSL https://burnbadge.mikaelmoise00.workers.dev/install.sh | bash';

  const copy = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className={styles.installSection}>
      <div className="container">
        <div className={styles.installGrid}>
          <div className={styles.installStep}>
            <span className={styles.installNumber}>1</span>
            <div className={styles.installContent}>
              <h3>Install</h3>
              <div className={styles.terminal}>
                <code>{installCommand}</code>
                <button className={styles.copyBtn} onClick={copy}>
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <div className={styles.installStep}>
            <span className={styles.installNumber}>2</span>
            <div className={styles.installContent}>
              <h3>Configure</h3>
              <div className={styles.terminal}>
                <code>burnbadge setup</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Track your AI API spending with beautiful badges and charts">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <InstallSection />
        <CreateProjectForm />
      </main>
    </Layout>
  );
}
