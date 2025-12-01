import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export async function POST({ request }) {
	try {
		const { traits, profile, context } = await request.json();

		const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

		const prompt = `
			Analyze this user profile and context.
			DO NOT mention their specific device (e.g. "Hello Mac User").
			Instead, use the device traits to construct a demographic persona (e.g. Mac User -> Creative Professional -> Target with design software or expensive coffee).
			Market a product to that specific demographic.
			
			ALSO, generate a "Dynamic Pricing Scenario" for a Flight to Tokyo (Economy Class • Round Trip).
			The Standard Market Rate is $1000.
			Calculate a "User Price" based on their profile (e.g. charge more for rich users, less for budget users).
			
			Inferred Profile:
			${JSON.stringify(profile, null, 2)}

			Device Traits (Use for background inference only):
			${JSON.stringify(traits, null, 2)}

			User Context (Real-time data):
			${JSON.stringify(context, null, 2)}

			Return ONLY a JSON object with this structure:
			{
				"ad": {
					"headline": "Short, punchy headline",
					"body": "2 sentence body text appealing to them",
					"category": "The ad category (e.g. 'Luxury Goods', 'Predatory Loans', 'Tech Recruitment')",
					"company": "A fake, company name",
					"website": "www.companyname.(any tld that does not exist)",
					"styles": {
						"backgroundColor": "#hexcode (dark or light based on vibe)",
						"textColor": "#hexcode (contrast with background)",
						"accentColor": "#hexcode (for highlights)",
						"fontFamily": "one of: 'Courier New', 'Times New Roman', 'Arial', 'Brush Script MT', 'Impact', 'Comic Sans MS', 'Papyrus', 'Chalkduster', 'Luminari', 'Baskerville'"
					}
				},
				"pricing": {
					"product": "Flight to Tokyo",
					"description": "Economy Class • Round Trip",
					"standardPrice": 1000,
					"userPrice": standardPrice + (standardPrice * markupPercentage / 100),
					"markupPercentage": markupPercentage,
					"reason": "Short reason for price change (e.g. 'High-end device detected')"
				}
			}
			Do not include markdown formatting or backticks. Just the raw JSON string.
		`;

		const result = await model.generateContent(prompt);
		const response = result.response;
		const text = response.text();

		// Clean up potential markdown code blocks if Gemini adds them
		const cleanText = text
			.replace(/```json/g, '')
			.replace(/```/g, '')
			.trim();

		const data = JSON.parse(cleanText);

		return json(data);
	} catch (error) {
		console.error('Error generating ad:', error);
		return json(
			{
				ad: {
					headline: 'Targeting Algorithm Failed',
					body: 'You are currently too boring to profile. Try buying more things.',
					category: 'System Error',
					company: 'NullPointer Inc.',
					website: 'www.error.null',
					styles: {
						backgroundColor: '#1a1a1a',
						textColor: '#888888',
						accentColor: '#ff0000',
						fontFamily: 'Courier New'
					}
				},
				pricing: {
					product: 'System Error',
					description: 'Pricing Unavailable',
					standardPrice: 0,
					userPrice: 0,
					markupPercentage: 0,
					reason: 'Algorithm failed'
				}
			},
			{ status: 500 }
		);
	}
}
