'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Calendar } from 'lucide-react';
import { useParams } from 'next/navigation';

/**
 * Candidate-facing interview confirmation page.
 * Accessed via emailed link — NO auth required.
 * Shows 2-3 offered time slots, one-click confirm.
 */

interface InterviewSlot {
  id: string;
  proposed_start: string;
  proposed_end: string;
  status: string;
}

interface ConfirmData {
  application_id: string;
  candidate_name: string;
  job_title: string;
  slots: InterviewSlot[];
  already_confirmed: boolean;
}

export default function InterviewConfirmPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    async function fetchSlots() {
      try {
        const res = await fetch(`/api/interviews/${applicationId}/confirm`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to load interview slots.');
          return;
        }
        setData(json.data);
        if (json.data.already_confirmed) {
          setConfirmed(true);
        }
      } catch {
        setError('Failed to load interview details.');
      } finally {
        setLoading(false);
      }
    }
    fetchSlots();
  }, [applicationId]);

  async function handleConfirm(slotId: string) {
    setConfirming(slotId);
    setError(null);

    try {
      const res = await fetch(`/api/interviews/${applicationId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to confirm slot.');
        return;
      }

      setConfirmed(true);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setConfirming(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA]">
        <div className="animate-pulse text-[#627D98]">Loading interview details…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] px-4">
        <Card className="w-full max-w-md border-[#E4E7EB]">
          <CardContent className="py-8 text-center">
            <p className="text-red-600 text-sm">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] px-4">
        <Card className="w-full max-w-md border-[#E4E7EB]">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-[#E6F7F3] flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[#0F6E5C]" />
            </div>
            <h2 className="text-xl font-bold text-[#1F2933] mb-2">
              Interview Confirmed!
            </h2>
            <p className="text-sm text-[#627D98] max-w-xs mx-auto">
              Your interview for the{' '}
              <span className="font-medium text-[#334E68]">
                {data?.job_title}
              </span>{' '}
              position has been confirmed. You&apos;ll receive a calendar
              invitation shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F6E5C] flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1F2933]">
              HireFlow
            </h1>
          </div>
          <p className="text-sm text-[#627D98]">Interview Scheduling</p>
        </div>

        <Card className="border-[#E4E7EB] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              Hi {data?.candidate_name}! 👋
            </CardTitle>
            <CardDescription>
              Please select your preferred interview time for the{' '}
              <span className="font-medium text-[#334E68]">
                {data?.job_title}
              </span>{' '}
              position.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {data?.slots.filter((s) => s.status === 'offered').length === 0 ? (
              <p className="text-sm text-[#627D98] text-center py-4">
                No available time slots. Please contact the recruiter.
              </p>
            ) : (
              data?.slots
                .filter((s) => s.status === 'offered')
                .map((slot) => {
                  const start = new Date(slot.proposed_start);
                  const end = new Date(slot.proposed_end);

                  return (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between rounded-lg border border-[#E4E7EB] bg-white p-4 hover:border-[#0F6E5C] hover:bg-[#F7FDFB] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-[#0F6E5C]" />
                        <div>
                          <div className="font-medium text-sm text-[#1F2933]">
                            {start.toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="text-xs text-[#627D98] font-mono">
                            {start.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            –{' '}
                            {end.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleConfirm(slot.id)}
                        disabled={confirming !== null}
                        className="bg-[#0F6E5C] hover:bg-[#0B5A4A] text-white text-xs"
                        size="sm"
                      >
                        {confirming === slot.id ? 'Confirming…' : 'Select'}
                      </Button>
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[#9FB3C8]">
          This link is unique to your application. Do not share it.
        </p>
      </div>
    </div>
  );
}
