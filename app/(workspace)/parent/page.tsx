import { redirect } from 'next/navigation';

export default function ParentPage() {
  // Parent workspace is disabled for the student-only competition build.
  redirect('/student');
}
