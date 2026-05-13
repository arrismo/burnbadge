import React, { useState } from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './create-project.module.css';

interface ProjectResponse {
  token: string;
  badgeToken: string;
  usageToken: string;
  badgeUrl: string;
  chartUrl: string;
  usageUrl: string;
}

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter', logo: 'openrouter' },
  { value: 'anthropic', label: 'Anthropic', logo: 'anthropic' },
  { value: 'openai', label: 'OpenAI', logo: 'openai' },
  { value: 'opencode', label: 'OpenCode', logo: '' },
  { value: 'mock', label: 'Mock (for testing)', logo: '' },
] as const;

export default function CreateProject(): React.ReactNode {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Layout
      title="Create Project"
      description="Create a new Burnbadge project to track your AI API spending">
      <div className="container margin-top--xl margin-bottom--xl">
        <div className="row">
          <div className="col col--8 col--offset-2">
            <Heading as="h1" className={styles.title}>
              Create a Burnbadge Project
            </Heading>
            <p className={styles.subtitle}>
              Select your AI provider and generate your tokens. No signup required.
            </p>

            <div className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="provider">AI Provider</label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={loading}
                  className={styles.select}>
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="button button--primary button--lg"
                onClick={handleCreate}
                disabled={loading}>
                {loading ? 'Creating...' : 'Create Project'}
              </button>
            </div>

            {error && (
              <div className={`alert alert--danger ${styles.alert}`} role="alert">
                <strong>Error:</strong> {error}
              </div>
            )}

            {result && (
              <div className={styles.result}>
                <Heading as="h2" className={styles.resultTitle}>
                  Your Project is Ready!
                </Heading>

                <div className={styles.tokens}>
                  <div className={styles.tokenRow}>
                    <span className={styles.tokenLabel}>Badge Token (public)</span>
                    <code className={styles.tokenValue}>{result.badgeToken}</code>
                    <button
                      className="button button--sm button--secondary"
                      onClick={() => copyToClipboard(result.badgeToken, 'badge')}>
                      {copied === 'badge' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>

                  <div className={styles.tokenRow}>
                    <span className={styles.tokenLabel}>Usage Token (private)</span>
                    <code className={styles.tokenValue}>{result.usageToken}</code>
                    <button
                      className="button button--sm button--secondary"
                      onClick={() => copyToClipboard(result.usageToken, 'usage')}>
                      {copied === 'usage' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className={styles.urls}>
                  <h3>Your URLs</h3>
                  <div className={styles.urlRow}>
                    <span>Badge URL:</span>
                    <a href={result.badgeUrl} target="_blank" rel="noopener noreferrer">
                      {result.badgeUrl}
                    </a>
                  </div>
                  <div className={styles.urlRow}>
                    <span>Chart URL:</span>
                    <a href={result.chartUrl} target="_blank" rel="noopener noreferrer">
                      {result.chartUrl}
                    </a>
                  </div>
                  <div className={styles.urlRow}>
                    <span>Usage URL:</span>
                    <a href={result.usageUrl} target="_blank" rel="noopener noreferrer">
                      {result.usageUrl}
                    </a>
                  </div>
                </div>

                <div className={styles.nextSteps}>
                  <h3>Next Steps</h3>
                  <ol>
                    <li>
                      <strong>Copy your tokens</strong> above and save them somewhere safe.
                      You won't see the usage token again.
                    </li>
                    <li>
                      <strong>Add them to GitHub Secrets</strong> in your repository:<br />
                      <code>BURNBADGE_BADGE_TOKEN</code> = your badge token<br />
                      <code>BURNBADGE_USAGE_TOKEN</code> = your usage token
                    </li>
                    <li>
                      <strong>Set up the GitHub Actions workflow</strong> to push usage data.
                      See the{' '}
                      <a href="/docs/intro">Getting Started guide</a> for the full workflow.
                    </li>
                    <li>
                      <strong>Add the badge</strong> to your README:
                      <pre className={styles.codeBlock}>
                        {`![${provider} spend](${result.badgeUrl})`}
                      </pre>
                    </li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
