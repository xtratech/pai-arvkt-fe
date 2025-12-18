import { GoogleIcon } from "@/assets/icons";

type GoogleSigninButtonProps = {
  text: string;
  onClick: () => void | Promise<void>;
  loading?: boolean;
};

export default function GoogleSigninButton({ text, onClick, loading }: GoogleSigninButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3.5 rounded-lg border border-stroke bg-gray-2 p-[15px] font-medium transition hover:bg-opacity-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-dark-3 dark:bg-dark-2 dark:hover:bg-opacity-50"
    >
      <GoogleIcon />
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-dark border-t-transparent dark:border-white dark:border-t-transparent" />
          Connecting...
        </span>
      ) : (
        `${text} with Google`
      )}
    </button>
  );
}
