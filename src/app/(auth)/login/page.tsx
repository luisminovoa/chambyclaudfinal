import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-slate-900">Bienvenido de vuelta</h1>
        <p className="mt-1 text-sm text-slate-500">Ingresa a tu cuenta de Chamby</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
