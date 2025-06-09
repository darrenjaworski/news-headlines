// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

export async function activate(context: vscode.ExtensionContext) { // Made activate async
	vscode.window.showInformationMessage('NYTimes Headlines extension is activating!');

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "nytimes-headlines" is now active!');

	let helloWorldDisposable = vscode.commands.registerCommand('nytimes-headlines.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from NYTimes Headlines!');
	});
	context.subscriptions.push(helloWorldDisposable);

	// --- Scrolling Text Status Bar Item ---
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.text = "Hello World";
	statusBarItem.tooltip = "NYTimes Headlines";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	const RssFeedUrl = "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml";
	let headlines: string[] = ["Loading headlines..."]; // Default headline
	let currentHeadlineIndex = 0;

	// Function to fetch and parse RSS feed
	async function fetchHeadlines() {
		try {
			const response = await fetch(RssFeedUrl);
			if (!response.ok) {
				console.error(`Error fetching RSS feed: ${response.statusText}`);
				headlines = ["Error fetching headlines"];
				statusBarItem.text = headlines[0];
				return;
			}
			const xmlText = await response.text();
			const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
			const jsonObj = parser.parse(xmlText);

			let processedHeadlines: string[] = [];
			if (jsonObj.rss && jsonObj.rss.channel && jsonObj.rss.channel.item) {
				const items = Array.isArray(jsonObj.rss.channel.item) ? jsonObj.rss.channel.item : [jsonObj.rss.channel.item];
				const titles: string[] = items.map((item: any) => item.title).filter((title: string | undefined): title is string => title !== undefined);

				if (titles.length > 0) {
					for (let i = 0; i < titles.length; i++) {
						processedHeadlines.push(titles[i]);
						if (i < titles.length - 1) { // Add em dash if not the last headline
							processedHeadlines.push("—");
						}
					}
				}
			}

			if (processedHeadlines.length > 0) {
				headlines = processedHeadlines;
			} else {
				headlines = ["No headlines found"];
			}
			currentHeadlineIndex = 0; // Reset to the first headline
			// Update status bar with the first headline immediately after fetching
			if (headlines.length > 0) {
				// Add padding for scrolling effect, will be handled by startScrolling
				statusBarItem.text = headlines[currentHeadlineIndex];
			}
		} catch (error) {
			console.error("Failed to fetch or parse RSS feed:", error);
			headlines = ["Error fetching headlines"];
			statusBarItem.text = headlines[0];
		}
	}

	// const originalText = "Hello World                               "; // Add padding for smooth scrolling - Will be replaced by headlines
	let scrollIndex = 0;
	const scrollSpeed = 200 // ms
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
			if (headlines.length === 0) {
				statusBarItem.text = "No headlines";
				return; // Don't scroll if no headlines
			}

			let textToScroll = headlines[currentHeadlineIndex];
			// Add padding if text is shorter than a certain length to ensure smooth scroll
			const minLengthForScrolling = 40; // Adjust as needed
			if (textToScroll.length < minLengthForScrolling) {
				textToScroll = textToScroll + ' '.repeat(minLengthForScrolling - textToScroll.length);
			}

			const start = scrollIndex % textToScroll.length;
			statusBarItem.text = textToScroll.substring(start) + textToScroll.substring(0, start);
			scrollIndex++;

			// Move to the next headline when the current one has finished scrolling completely
			if (scrollIndex >= textToScroll.length) {
				scrollIndex = 0;
				currentHeadlineIndex = (currentHeadlineIndex + 1) % headlines.length;
				// No need to set statusBarItem.text here, interval will do it on next tick with new headline
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
	const toggleCommandId = 'nytimes-headlines.toggleScroll';
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
