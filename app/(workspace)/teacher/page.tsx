import { redirect } from 'next/navigation';

export default function TeacherPage() {
  // Teacher workspace is disabled for the student-only competition build.
  redirect('/student');
}
