'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle, MessageSquare, AlertTriangle } from 'lucide-react';

/**
 * Decision panel — the interactive Approve / Reject / Request More Info buttons.
 * 
 * Requires a confirming click (two-step: button → confirm dialog) per SPEC.md,
 * since this action triggers real emails via n8n.
 * 
 * This is a client component because it handles user interaction and state.
 */
export function DecisionPanel({ applicationId }: { applicationId: string }) {
  const [pendingDecision, setPendingDecision] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function confirmDecision() {
    if (!pendingDecision) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/applications/${applicationId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: pendingDecision,
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to record decision.');
        return;
      }

      setPendingDecision(null);
      setNotes('');
      router.refresh();
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  function cancelDecision() {
    setPendingDecision(null);
    setNotes('');
    setError(null);
  }

  const decisionConfig: Record<
    string,
    { label: string; description: string; icon: React.ReactNode; color: string }
  > = {
    approved: {
      label: 'Approve',
      description:
        'This will trigger an interview invitation email to the candidate via n8n.',
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'bg-[#0F6E5C] hover:bg-[#0B5A4A] text-white',
    },
    rejected: {
      label: 'Reject',
      description:
        'This will trigger a rejection email to the candidate via n8n.',
      icon: <XCircle className="w-5 h-5" />,
      color: 'bg-red-600 hover:bg-red-700 text-white',
    },
    more_info: {
      label: 'Request More Info',
      description:
        'This will notify the candidate that additional information is needed.',
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
  };

  return (
    <>
      <Card className="border-[#E4E7EB] border-2 border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Make a Decision
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[#627D98] mb-4">
            Your decision will trigger a real email to the candidate. A
            confirmation step is required before sending.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(decisionConfig).map(([key, config]) => (
              <Button
                key={key}
                onClick={() => setPendingDecision(key)}
                className={`gap-2 ${config.color}`}
              >
                {config.icon}
                {config.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={!!pendingDecision} onOpenChange={(open) => !open && cancelDecision()}>
        <DialogContent>
          {pendingDecision && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {decisionConfig[pendingDecision].icon}
                  Confirm: {decisionConfig[pendingDecision].label}
                </DialogTitle>
                <DialogDescription>
                  {decisionConfig[pendingDecision].description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="decision-notes">
                    Notes (optional)
                  </Label>
                  <Textarea
                    id="decision-notes"
                    placeholder="Add any notes about this decision…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={cancelDecision}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDecision}
                  disabled={submitting}
                  className={decisionConfig[pendingDecision].color}
                >
                  {submitting
                    ? 'Submitting…'
                    : `Confirm ${decisionConfig[pendingDecision].label}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
