import ProfileForm from '@/components/profile/ProfileForm';

export const metadata = { title: 'Profil Admin' };

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-100">Profil Admin</h2>
        <p className="text-sm text-slate-400">Perbarui nama tampilan dan foto profil.</p>
      </header>
      <ProfileForm />
    </div>
  );
}

