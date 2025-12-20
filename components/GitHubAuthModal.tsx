import * as React from 'react';
import { Github, X, Check, AlertCircle, Key, LogOut } from 'lucide-react';

interface GitHubAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: any;
}

interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  email: string | null;
}

export const GitHubAuthModal: React.FC<GitHubAuthModalProps> = ({
  isOpen,
  onClose,
  theme
}) => {
  const [token, setToken] = React.useState('');
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<GitHubUser | null>(() => {
    const saved = localStorage.getItem('gh_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Load token from localStorage
  React.useEffect(() => {
    const savedToken = localStorage.getItem('gh_token');
    if (savedToken && !user) {
      // Auto-verify on load
      verifyToken(savedToken);
    }
  }, []);

  const verifyToken = async (tokenToVerify: string) => {
    setIsAuthenticating(true);
    setError(null);

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error('Invalid token or insufficient permissions');
      }

      const userData = await response.json();
      
      // Save token and user data
      localStorage.setItem('gh_token', tokenToVerify);
      localStorage.setItem('gh_user', JSON.stringify(userData));
      setUser(userData);
      setToken('');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      localStorage.removeItem('gh_token');
      localStorage.removeItem('gh_user');
      setUser(null);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleConnect = async () => {
    if (!token.trim()) {
      setError('Please enter a GitHub token');
      return;
    }

    await verifyToken(token.trim());
  };

  const handleDisconnect = () => {
    if (window.confirm('Disconnect GitHub account? You will need to re-authenticate to push/pull.')) {
      localStorage.removeItem('gh_token');
      localStorage.removeItem('gh_user');
      setUser(null);
      setToken('');
      setError(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            <h2 className="text-lg font-semibold">GitHub Authentication</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {user ? (
            // Connected State
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <Check className="w-5 h-5 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">Connected to GitHub</p>
                  <p className="text-xs text-green-700">You can now push and pull changes</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 border rounded-lg">
                <img 
                  src={user.avatar_url} 
                  alt={user.login}
                  className="w-12 h-12 rounded-full"
                />
                <div className="flex-1">
                  <p className="font-medium">{user.name || user.login}</p>
                  <p className="text-sm text-gray-600">@{user.login}</p>
                  {user.email && (
                    <p className="text-xs text-gray-500">{user.email}</p>
                  )}
                </div>
              </div>

              <button
                onClick={handleDisconnect}
                className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Disconnect Account
              </button>
            </div>
          ) : (
            // Disconnected State
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 mb-2">
                  Connect your GitHub account to enable push/pull functionality in the Git Tracker.
                </p>
                <p className="text-xs text-blue-700">
                  You'll need a Personal Access Token (classic) with <code className="bg-blue-100 px-1 rounded">repo</code> scope.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isAuthenticating}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={isAuthenticating || !token.trim()}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAuthenticating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Connect GitHub
                  </>
                )}
              </button>

              {/* Instructions */}
              <div className="mt-4 p-3 bg-gray-50 rounded text-xs space-y-2">
                <p className="font-medium text-gray-700">How to create a token:</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                  <li>Go to GitHub Settings → Developer settings</li>
                  <li>Click "Personal access tokens" → "Tokens (classic)"</li>
                  <li>Click "Generate new token (classic)"</li>
                  <li>Give it a name and select the <code className="bg-gray-200 px-1 rounded">repo</code> scope</li>
                  <li>Click "Generate token" and copy it</li>
                  <li>Paste the token above</li>
                </ol>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Codemend-AI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-blue-600 hover:underline"
                >
                  → Create token now
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 text-xs text-gray-500">
          <p>🔒 Your token is stored locally in your browser and never sent to our servers.</p>
        </div>
      </div>
    </div>
  );
};

// Helper function to check if user is authenticated
export const isGitHubAuthenticated = (): boolean => {
  return !!localStorage.getItem('gh_token');
};

// Helper function to get GitHub token
export const getGitHubToken = (): string | null => {
  return localStorage.getItem('gh_token');
};

// Helper function to get GitHub user
export const getGitHubUser = (): GitHubUser | null => {
  const saved = localStorage.getItem('gh_user');
  return saved ? JSON.parse(saved) : null;
};
