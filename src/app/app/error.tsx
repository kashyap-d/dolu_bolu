"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export default function WorkspaceError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Notice role="alert" title="Your workspace could not be loaded." tone="danger">
        <p>
          This is usually temporary. If it keeps happening, check that every migration in
          <code className="mx-1">supabase/migrations</code>has been applied.
        </p>
        <Button className="mt-4" onClick={retry} variant="secondary">
          <RotateCcw size={14} /> Try again
        </Button>
      </Notice>
    </div>
  );
}
