'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, GripVertical, Briefcase, AlertCircle } from 'lucide-react';
import type { JobPosting, JobCriterion } from '@/lib/types';

// ---- Empty criterion template ----
function emptyCriterion(): JobCriterion {
  return { name: '', description: '', weight: 0 };
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<JobPosting | null>(null);

  const supabase = createClient();

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const json = await res.json();
      if (json.data) {
        setJobs(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  function handleJobCreated() {
    setDialogOpen(false);
    fetchJobs();
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F2933]">
            Job Postings
          </h1>
          <p className="text-sm text-[#627D98] mt-1">
            Define structured scoring criteria for each position
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button className="bg-[#0F6E5C] hover:bg-[#0B5A4A] text-white gap-2" />
            }
          >
            <Plus className="w-4 h-4" />
            New Job Posting
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <CreateJobForm onSuccess={handleJobCreated} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-pulse text-[#627D98] text-sm">Loading job postings…</div>
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-[#E4E7EB]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-[#F0F4F8] flex items-center justify-center mb-4">
              <Briefcase className="w-8 h-8 text-[#9FB3C8]" />
            </div>
            <h3 className="font-semibold text-[#1F2933] mb-1">
              No job postings yet
            </h3>
            <p className="text-sm text-[#627D98] max-w-sm mb-4">
              Create your first job posting with structured criteria. Each
              criterion defines what a candidate&apos;s resume is scored against.
            </p>
            <Button
              className="bg-[#0F6E5C] hover:bg-[#0B5A4A] text-white gap-2"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              Create your first posting
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="border-[#E4E7EB] hover:border-[#CBD2D9] transition-colors cursor-pointer"
              onClick={() => setDetailJob(job)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{job.title}</CardTitle>
                    {job.description && (
                      <CardDescription className="line-clamp-2">
                        {job.description}
                      </CardDescription>
                    )}
                  </div>
                  <Badge
                    variant={job.is_active ? 'default' : 'secondary'}
                    className={
                      job.is_active
                        ? 'bg-[#E6F7F3] text-[#0F6E5C] hover:bg-[#E6F7F3]'
                        : ''
                    }
                  >
                    {job.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-xs text-[#627D98]">
                  <span>
                    {(job.criteria as JobCriterion[]).length} criteria
                  </span>
                  <span>
                    Total weight:{' '}
                    {(job.criteria as JobCriterion[]).reduce(
                      (sum, c) => sum + c.weight,
                      0
                    )}
                  </span>
                  <span className="font-mono">
                    {new Date(job.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Job Detail Dialog */}
      <Dialog open={!!detailJob} onOpenChange={(open) => !open && setDetailJob(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailJob && <JobDetail job={detailJob} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Create Job Form — structured criteria as separate rows
// ============================================================================

function CreateJobForm({ onSuccess }: { onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<JobCriterion[]>([
    emptyCriterion(),
    emptyCriterion(),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateCriterion(
    index: number,
    field: keyof JobCriterion,
    value: string | number
  ) {
    setCriteria((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function removeCriterion(index: number) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }

  function addCriterion() {
    setCriteria((prev) => [...prev, emptyCriterion()]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    const validCriteria = criteria.filter(
      (c) => c.name.trim() !== '' && c.description.trim() !== ''
    );
    if (validCriteria.length === 0) {
      setError('At least one criterion with a name and description is required.');
      return;
    }

    const totalWeight = validCriteria.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) {
      setError('Total criteria weight must be greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          criteria: validCriteria,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to create job posting.');
        return;
      }

      onSuccess();
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Job Posting</DialogTitle>
        <DialogDescription>
          Define the position and its structured scoring criteria. Each criterion
          is what a candidate&apos;s resume will be explicitly scored against — name,
          description, and weight.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6 mt-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="job-title">Job Title</Label>
          <Input
            id="job-title"
            placeholder="e.g., Senior React Developer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="job-description">Description (optional)</Label>
          <Textarea
            id="job-description"
            placeholder="Brief description of the role and team…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        {/* Criteria — the structured rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Scoring Criteria</Label>
            <span className="text-xs text-[#627D98]">
              Total weight:{' '}
              <span className="font-mono font-semibold">
                {criteria.reduce((sum, c) => sum + c.weight, 0)}
              </span>
            </span>
          </div>

          <div className="space-y-3">
            {criteria.map((criterion, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1fr_80px_40px] gap-2 items-start rounded-lg border border-[#E4E7EB] bg-[#F7F8FA] p-3"
              >
                <div className="space-y-1">
                  <Label className="text-xs text-[#627D98]">Name</Label>
                  <Input
                    placeholder="e.g., React experience"
                    value={criterion.name}
                    onChange={(e) =>
                      updateCriterion(index, 'name', e.target.value)
                    }
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[#627D98]">Description</Label>
                  <Input
                    placeholder="e.g., 3+ years with React"
                    value={criterion.description}
                    onChange={(e) =>
                      updateCriterion(index, 'description', e.target.value)
                    }
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-[#627D98]">Weight</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={criterion.weight}
                    onChange={(e) =>
                      updateCriterion(
                        index,
                        'weight',
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="bg-white"
                  />
                </div>
                <div className="flex items-end h-full pb-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCriterion(index)}
                    disabled={criteria.length <= 1}
                    className="text-[#9FB3C8] hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCriterion}
            className="gap-1.5 text-[#627D98]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add criterion
          </Button>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            className="bg-[#0F6E5C] hover:bg-[#0B5A4A] text-white"
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Create Job Posting'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ============================================================================
// Job Detail View — shows criteria breakdown
// ============================================================================

function JobDetail({ job }: { job: JobPosting }) {
  const criteria = job.criteria as JobCriterion[];
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  return (
    <>
      <DialogHeader>
        <div className="flex items-start justify-between">
          <div>
            <DialogTitle className="text-xl">{job.title}</DialogTitle>
            {job.description && (
              <DialogDescription className="mt-1">
                {job.description}
              </DialogDescription>
            )}
          </div>
          <Badge
            variant={job.is_active ? 'default' : 'secondary'}
            className={
              job.is_active
                ? 'bg-[#E6F7F3] text-[#0F6E5C] hover:bg-[#E6F7F3]'
                : ''
            }
          >
            {job.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </DialogHeader>

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-[#1F2933]">
            Scoring Criteria
          </h3>
          <span className="text-xs text-[#627D98] font-mono">
            Total weight: {totalWeight}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">Criterion</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right w-[80px]">Weight</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {criteria.map((c, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-[#627D98]">
                  {c.description}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {c.weight}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="text-xs text-[#627D98] font-mono pt-2 border-t border-[#E4E7EB]">
          Created: {new Date(job.created_at).toLocaleString()} · ID: {job.id}
        </div>
      </div>
    </>
  );
}
