// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

let statusBarItem: vscode.StatusBarItem;
let scrollInterval: NodeJS.Timeout | undefined;
let refetchInterval: NodeJS.Timeout | undefined; // Added for periodic refetching
let scrollIndex = 0;
let scrollableText = ""; // Holds the full string of headlines
let isCurrentlyScrolling = false; // Tracks scrolling state
const scrollSpeed = 150; // ms 
const TEN_SECONDS_MS = 10 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const TOPIC_MAP: { [key: string]: string } = {
	"News": "1001",
	"World": "1004",
	"Business": "1006",
	"Science": "1007",
	"Culture": "1008"
};

export async function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "news-headlines" is now active!');

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	context.subscriptions.push(statusBarItem);

	function getRssFeedUrl(): string {
		const config = vscode.workspace.getConfiguration('news-headlines');
		const topicName = config.get<string>('feedTopic', 'News'); // Default to 'News'
		const topicId = TOPIC_MAP[topicName] || TOPIC_MAP['News']; // Fallback to News if invalid
		return `https://feeds.npr.org/${topicId}/rss.xml`;
	}

	async function fetchHeadlines() {
		const currentRssFeedUrl = getRssFeedUrl();
		try {
			const response = await fetch(currentRssFeedUrl);
			if (!response.ok) {
				console.error(`Error fetching RSS feed: ${response.statusText}`);
				scrollableText = "Error fetching headlines";
				statusBarItem.text = scrollableText;
				return;
			}
			const xmlText = await response.text();
			const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
			const jsonObj = parser.parse(xmlText);

			if (jsonObj.rss && jsonObj.rss.channel && jsonObj.rss.channel.item) {
				const items = Array.isArray(jsonObj.rss.channel.item) ? jsonObj.rss.channel.item : [jsonObj.rss.channel.item];
				const titles: string[] = items.map((item: any) => item.title).filter((title: string | undefined): title is string => title !== undefined);

				if (titles.length > 0) {
					scrollableText = titles.join(" — "); // Join with em dash and spaces
				} else {
					scrollableText = "No headlines found";
				}
			} else {
				scrollableText = "No headlines found";
			}
			// Update statusBarItem.text directly here so if scrolling doesn't start (e.g. error), the message is shown.
			// However, we want to preserve the intro message if this is the very first fetch.
			if (statusBarItem.text !== "Headlines brought to you by NPR" && statusBarItem.text !== "Fetching latest headlines...") {
				statusBarItem.text = scrollableText;
			}
		} catch (error) {
			console.error("Failed to fetch or parse RSS feed:", error);
			scrollableText = "Error fetching headlines";
			statusBarItem.text = scrollableText;
			// Similar to above, preserve intro/fetching message.
			if (statusBarItem.text !== "Headlines brought to you by NPR" && statusBarItem.text !== "Fetching latest headlines...") {
				statusBarItem.text = scrollableText;
			}
		}
	}

	// function updateToggleButtonText() { // Removed
	// 	toggleButton.text = isCurrentlyScrolling ? `$(debug-pause)` : `$(play)`; // Removed
	// 	toggleButton.tooltip = isCurrentlyScrolling ? "Pause Headlines" : "Resume Headlines"; // Removed
	// } // Removed

	function startScrolling() {
		if (scrollInterval) {
			clearInterval(scrollInterval);
		}
		scrollIndex = 0; // Reset scroll index whenever scrolling starts with new/old text
		scrollInterval = setInterval(() => {
			let textToScroll = scrollableText;
			const minLengthForScrolling = 40;
			if (textToScroll.length > 0 && textToScroll.length < minLengthForScrolling) { // Check length > 0
				textToScroll = textToScroll + ' '.repeat(minLengthForScrolling - textToScroll.length);
			} else if (textToScroll.length === 0) { // Handle empty scrollableText
				statusBarItem.text = ""; // Or some placeholder
				return; // Don't try to scroll empty text
			}


			const start = scrollIndex % textToScroll.length;
			statusBarItem.text = textToScroll.substring(start) + textToScroll.substring(0, start);
			scrollIndex++;

			if (scrollIndex >= textToScroll.length) {
				scrollIndex = 0;
			}
		}, scrollSpeed);
		isCurrentlyScrolling = true;
		// updateToggleButtonText(); // Removed
	}

	function stopScrolling() {
		if (scrollInterval) {
			clearInterval(scrollInterval);
			scrollInterval = undefined;
		}
		isCurrentlyScrolling = false;
		// updateToggleButtonText(); // Removed
		// When scrolling stops, the status bar shows the last scrolled segment.
		// If we want it to show the full static message, we'd set statusBarItem.text = scrollableText here.
		// For now, leaving it as is.
	}

	async function fetchHeadlinesAndScroll() {
		statusBarItem.text = "Fetching latest headlines..."; // Show fetching message
		await fetchHeadlines(); // This sets scrollableText and statusBarItem.text (especially for errors)

		if (scrollableText && scrollableText !== "Error fetching headlines" && scrollableText !== "No headlines found") {
			startScrolling(); // This will use the new scrollableText
		} else {
			// If fetchHeadlines resulted in an error or no headlines,
			// statusBarItem.text is already set by fetchHeadlines.
			// Ensure scrolling is stopped if it was somehow active for an error message.
			if (isCurrentlyScrolling) {
				stopScrolling();
			}
			// statusBarItem.text will display the error or "No headlines found" statically.
		}
	}

	// Initial UI setup
	statusBarItem.show();
	// toggleButton.show(); // Removed
	// updateToggleButtonText(); // Removed

	// Phase 1: Scroll "Headlines brought to you by NPR" for 5 seconds
	scrollableText = "Headlines brought to you by NPR";
	statusBarItem.text = scrollableText; // Set text before starting scroll
	startScrolling();

	// Phase 2: After 5 seconds, fetch actual headlines and set up periodic refetch
	const initialFetchTimeout = setTimeout(async () => {
		stopScrolling(); // Stop the intro scroll
		await fetchHeadlinesAndScroll(); // Fetch and scroll actual headlines

		// Setup periodic refetching
		if (refetchInterval) { clearInterval(refetchInterval); } // Clear if somehow already set
		refetchInterval = setInterval(async () => {
			if (isCurrentlyScrolling) { stopScrolling(); } // Stop current scroll before refetching
			await fetchHeadlinesAndScroll(); // Fetch and scroll new headlines
		}, FIFTEEN_MINUTES_MS);
		context.subscriptions.push({ dispose: () => { if (refetchInterval) { clearInterval(refetchInterval); } } });

	}, TEN_SECONDS_MS);
	context.subscriptions.push({ dispose: () => clearTimeout(initialFetchTimeout) });

	// Listen for configuration changes
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('news-headlines.feedTopic')) {
			console.log('News feed topic changed. Refetching headlines...');
			if (isCurrentlyScrolling) {
				stopScrolling();
			}
			// Clear existing refetch interval and restart the fetch process
			if (refetchInterval) {
				clearInterval(refetchInterval);
			}
			// Also clear the initial fetch timeout if it hasn't fired yet, though less likely
			clearTimeout(initialFetchTimeout);

			// Immediately fetch and scroll with the new topic, then reset the 15-min interval
			await fetchHeadlinesAndScroll();

			refetchInterval = setInterval(async () => {
				if (isCurrentlyScrolling) { stopScrolling(); }
				await fetchHeadlinesAndScroll();
			}, FIFTEEN_MINUTES_MS);
			// The disposable for refetchInterval is already pushed, but we are creating a new interval ID.
			// It's generally safer to push a new disposable for the new interval, though the old one would clear the new one if not careful.
			// For simplicity here, we rely on the existing disposable to clear the *latest* refetchInterval ID.
		}
	}));


	// Ensure the main scrollInterval is cleared when the extension deactivates
	// This is implicitly handled if scrollInterval is always cleared in stopScrolling()
	// and stopScrolling() is called appropriately, or by adding its own disposable.
	// Adding a specific disposable for scrollInterval for robustness:
	context.subscriptions.push({
		dispose: () => {
			if (scrollInterval) {
				clearInterval(scrollInterval);
			}
		}
	});
}

export function deactivate() {
	// Intervals are cleared by their disposables being called by VS Code
	// No explicit clearInterval needed here if they are correctly added to context.subscriptions
	console.log("News headlines extension deactivated. Intervals should be cleared.");
}
