import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import Link from "next/link";

export default function DriveNotFound() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Notice title="This Job Drive does not exist or is not yours.">
        <Link className={buttonClasses({ variant: "secondary", className: "mt-4" })} href="/app/drives">
          Back to Drives
        </Link>
      </Notice>
    </div>
  );
}
