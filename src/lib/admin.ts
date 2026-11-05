export const STATUS_AR: Record<string, string> = {
  submitted: 'زیرِ جائزہ',
  returned: 'تبدیلی درکار',
  approved: 'منظور شدہ',
  published: 'شائع شدہ',
  rejected: 'مسترد',
};
export const STATUS_ORDER = ['submitted', 'returned', 'approved', 'published', 'rejected'];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// جی میل میں تیار پیغام کھولنے کا لنک (ایڈیٹر خود بھیجتا ہے)
export function gmailLink(to: string, subject: string, body: string): string {
  return (
    'https://mail.google.com/mail/?view=cm&fs=1' +
    `&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}
