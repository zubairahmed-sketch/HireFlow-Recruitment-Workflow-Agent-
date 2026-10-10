import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { jobPostings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v4';

/**
 * GET /api/jobs — list all active job postings for the current user.
 * POST /api/jobs — create a new job posting with structured criteria.
 */

const createJobSchema = z.object({
  title: z.string().min(1, 'Job title is required'),
  description: z.string().optional(),
  criteria: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        weight: z.number().min(0).max(1).optional(),
      })
    )
    .min(1, 'At least one criterion is required'),
});

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    const jobs = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.userId, userId))
      .orderBy(jobPostings.createdAt);

    return NextResponse.json({ data: jobs });
  } catch (err) {
    console.error('[jobs GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createJobSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const db = getDb();
    const [job] = await db
      .insert(jobPostings)
      .values({
        userId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        criteria: parsed.data.criteria,
      })
      .returning();

    return NextResponse.json({ data: job }, { status: 201 });
  } catch (err) {
    console.error('[jobs POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
