export const PromptCard = ({ prompt, label = 'Use this pre-built prompt to get started faster.' }) => {
	const [copied, setCopied] = useState(false);

	const copyPrompt = async () => {
		await navigator.clipboard.writeText(prompt);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const cursorHref = 'https://cursor.com/link/prompt?text=' + encodeURIComponent(prompt);

	return (
		<div className="mediadrop-prompt-card">
			<style>{`
				.mediadrop-prompt-card {
					--card-bg: #f7f7f5;
					--card-border: #eaeae7;
					--card-text: #1a1a1a;
					--btn-primary-bg: #111111;
					--btn-primary-text: #ffffff;
					--btn-secondary-bg: #ffffff;
					--btn-secondary-border: #1a1a1a;
					--btn-secondary-text: #1a1a1a;
					display: flex;
					flex-direction: column;
					gap: 1rem;
					padding: 1.25rem 1.5rem;
					border-radius: 12px;
					background: var(--card-bg);
					border: 1px solid var(--card-border);
					color: var(--card-text);
					margin: 1.5rem 0;
				}
				.dark .mediadrop-prompt-card {
					--card-bg: #16161a;
					--card-border: #2a2a30;
					--card-text: #e4e4e7;
					--btn-primary-bg: #ffffff;
					--btn-primary-text: #111111;
					--btn-secondary-bg: #16161a;
					--btn-secondary-border: #3a3a42;
					--btn-secondary-text: #e4e4e7;
				}
				.mediadrop-prompt-card__label {
					display: flex;
					align-items: center;
					gap: 0.6rem;
					font-size: 0.95rem;
				}
				.mediadrop-prompt-card__actions {
					display: flex;
					gap: 0.6rem;
					justify-content: flex-end;
				}
				.mediadrop-prompt-card__button {
					display: inline-flex;
					align-items: center;
					gap: 0.4rem;
					padding: 0.5rem 1.1rem;
					border-radius: 999px;
					font-size: 0.85rem;
					font-weight: 500;
					cursor: pointer;
					text-decoration: none;
					white-space: nowrap;
					border: 1px solid transparent;
				}
				.mediadrop-prompt-card__button--primary {
					background: var(--btn-primary-bg);
					color: var(--btn-primary-text);
				}
				.mediadrop-prompt-card__button--secondary {
					background: var(--btn-secondary-bg);
					border-color: var(--btn-secondary-border);
					color: var(--btn-secondary-text);
				}
			`}</style>
			<div className="mediadrop-prompt-card__label">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<rect x="7" y="7" width="10" height="10" rx="1" />
					<path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
				</svg>
				<span>{label}</span>
			</div>
			<div className="mediadrop-prompt-card__actions">
				<button type="button" className="mediadrop-prompt-card__button mediadrop-prompt-card__button--primary" onClick={copyPrompt}>
					{copied ? 'Copied!' : 'Copy prompt'}
				</button>
				<a className="mediadrop-prompt-card__button mediadrop-prompt-card__button--secondary" href={cursorHref}>
					Open in Cursor
				</a>
			</div>
		</div>
	);
};
