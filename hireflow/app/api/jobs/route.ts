import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod/v4';

// -- Zod schemas --

const jobCriterionSchema = z.object({
  name: z.string().min(1, 'Criterion name is required'),
  description: z.string().min(1, 'Criterion description is required'),
  weight: z.number().min(0).max(100),
});

const createJobPostingSchema = z.object({
  title: z.string().min(1, 'Job title is required'),
  description: z.string().optional(),
  criteria: z
    .array(jobCriterionSchema)
    .min(1, 'At least one criterion is required'),
});

// -- GET: List all job postings for the authenticated user --

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from('job_postings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/jobs] Supabase error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch job postings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[GET /api/jobs] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// -- POST: Create a new job posting with structured criteria --

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = createJobPostingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Validate that weights sum to something reasonable (not enforced in schema, but useful)
    const totalWeight = parsed.data.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) {
      return NextResponse.json(
        { error: 'Total criteria weight must be greater than 0' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('job_postings')
      .insert({
        user_id: user.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        criteria: parsed.data.criteria,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/jobs] Supabase error:', error.message);
      return NextResponse.json(
        { error: 'Failed to create job posting' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/jobs] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
