This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Google Sheets Integration (Questionnaire Answers)

You can use Google Sheets as the questionnaire source (instead of direct Typeform webhook processing).

1. Publish your worksheet as CSV.
2. Configure environment variables in `.env.local`:

```bash
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_CSV_URL="https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=0"
GOOGLE_SHEETS_INTERNAL_CSV_URL="https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=0"
GOOGLE_SHEETS_STRICT_MATCH=true
```

3. Ensure your sheet has at least these columns:
- `assessment_id` (recommended)
- `question_text`
- `answer_text`

The integration also supports Typeform exported CSV in "wide format" (one row per response, many question columns), in both Portuguese and English headers.

Optional:
- `domain`
- `review_status` (`compliant` or `needs_review`)
- `evidence_url`
- `entity_slug` / `entity_name`

When rows match the current entity/assessment, answers are shown in the detail page (`Security Review` tab).

`GOOGLE_SHEETS_STRICT_MATCH=true` (default) avoids ambiguous imports and only accepts deterministic matches.

Health check endpoint:
- `GET /api/health/google-sheets`

## Internal Questionnaire Sheet

The `Internal Questionnaire` tab on vendor details supports a Google Sheets layout with one row per vendor. The configured sheet should include columns like:

- `VENDOR`
- `TICKET`
- `Solicitado por`
- `Status Mini Questionário`

All remaining columns in the row are interpreted as question/answer pairs for the internal questionnaire.

Optional environment variables for explicit column mapping:

```bash
GOOGLE_SHEETS_INTERNAL_COLUMN_VENDOR="VENDOR"
GOOGLE_SHEETS_INTERNAL_COLUMN_TICKET="TICKET"
GOOGLE_SHEETS_INTERNAL_COLUMN_REQUESTER="Solicitado por"
GOOGLE_SHEETS_INTERNAL_COLUMN_STATUS="Status Mini Questionário"
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
