import { SignUp } from '@clerk/nextjs';

/**
 * Signup page — uses Clerk's prebuilt SignUp component.
 * Redirects to /dashboard on success.
 */
export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[#0F6E5C] flex items-center justify-center">
              <span className="text-white font-bold text-lg font-mono">H</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1F2933]">
              HireFlow
            </h1>
          </div>
          <p className="text-sm text-[#627D98]">
            Create your account to get started
          </p>
        </div>

        {/* Clerk SignUp component */}
        <div className="flex justify-center">
          <SignUp
            appearance={{
              elements: {
                rootBox: 'w-full',
                cardBox: 'w-full shadow-none',
                card: 'w-full shadow-none border border-[#E4E7EB] rounded-xl',
                formButtonPrimary: 'bg-[#0F6E5C] hover:bg-[#0B5A4A]',
              },
            }}
            forceRedirectUrl="/dashboard"
          />
        </div>
      </div>
    </div>
  );
}
