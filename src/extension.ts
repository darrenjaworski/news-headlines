// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

export async function activate(context: vscode.ExtensionContext) { // Made activate async

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "news-headlines" is now active!');

	// --- Scrolling Text Status Bar Item ---
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	let scrollableText: string = "Loading headlines..."; // Will hold the combined string of headlines
	statusBarItem.text = scrollableText;
	statusBarItem.tooltip = "news Headlines";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	const RssFeedUrl = "https://feeds.npr.org/1001/rss.xml";

	// Function to fetch and parse RSS feed
	async function fetchHeadlines() {
		try {
			const response = await fetch(RssFeedUrl);
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
			statusBarItem.text = scrollableText; // Update status bar with the full text before scrolling starts
		} catch (error) {
			console.error("Failed to fetch or parse RSS feed:", error);
			scrollableText = "Error fetching headlines";
			statusBarItem.text = scrollableText;
		}
	}

	let scrollIndex = 0;
	const scrollSpeed = 150 // ms - Increased from 200ms for slower scroll
	let scrollIntervalId: NodeJS.Timeout | undefined = undefined;
	let isCurrentlyScrolling = false;

	// --- Toggle Button Status Bar Item ---
	const toggleButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99); // Priority 99 to appear to the right of item with 100
	toggleButton.tooltip = "Pause/Resume Scrolling";
	// The command will be assigned after it's registered.
	// The text will be set by updateToggleButtonText().

	function updateToggleButtonText() {
		toggleButton.text = isCurrentlyScrolling ? "$(debug-pause)" : "$(play)";
	}

	function startScrolling() {
		if (scrollIntervalId) { // Clear any existing interval before starting a new one
			clearInterval(scrollIntervalId);
		}
		scrollIntervalId = setInterval(() => {
			// if (headlines.length === 0) { // REMOVED check, scrollableText always has content
			// 	statusBarItem.text = "No headlines";
			// 	return; 
			// }

			let textToScroll = scrollableText;
			// Add padding if text is shorter than a certain length to ensure smooth scroll
			const minLengthForScrolling = 40; // Adjust as needed
			if (textToScroll.length < minLengthForScrolling) {
				textToScroll = textToScroll + ' '.repeat(minLengthForScrolling - textToScroll.length);
			}

			const start = scrollIndex % textToScroll.length;
			statusBarItem.text = textToScroll.substring(start) + textToScroll.substring(0, start);
			scrollIndex++;

			// Loop the entire combined string
			if (scrollIndex >= textToScroll.length) {
				scrollIndex = 0;
				// currentHeadlineIndex = (currentHeadlineIndex + 1) % headlines.length; // REMOVED
			}
		}, scrollSpeed);
		isCurrentlyScrolling = true;
		updateToggleButtonText();
	}

	function stopScrolling() {
		if (scrollIntervalId) {
			clearInterval(scrollIntervalId);
			scrollIntervalId = undefined;
		}
		isCurrentlyScrolling = false;
		updateToggleButtonText();
	}

	// --- Register Toggle Command ---
	const toggleCommandId = 'news-headlines.toggleScroll';
	let toggleScrollDisposable = vscode.commands.registerCommand(toggleCommandId, () => {
		if (isCurrentlyScrolling) {
			stopScrolling();
		} else {
			startScrolling();
		}
	});
	context.subscriptions.push(toggleScrollDisposable);

	// --- Finalize Toggle Button Setup ---
	toggleButton.command = toggleCommandId;
	toggleButton.show();
	context.subscriptions.push(toggleButton);

	// --- Initial State ---
	await fetchHeadlines(); // Fetch headlines first
	startScrolling(); // Start scrolling when the extension activates

	// Ensure the interval is cleared when the extension deactivates or the subscription is disposed
	context.subscriptions.push({
		dispose: () => {
			if (scrollIntervalId) {
				clearInterval(scrollIntervalId);
			}
		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Any additional cleanup can go here if needed
}
