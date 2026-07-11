/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Folder, 
  FileText, 
  Sparkles, 
  ArrowRight, 
  User, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2, 
  ShieldCheck, 
  Zap, 
  Play, 
  Layers, 
  AlertCircle,
  HardDrive
} from 'lucide-react';

interface LandingPageProps {
  onAuthSuccess: (user: { email: string; name: string }) => void;
  authLoading: boolean;
  authError: string;
  setAuthError: (err: string) => void;
}

export default function LandingPage({
  onAuthSuccess,
  authLoading,
  authError,
  setAuthError
}: LandingPageProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleOpenAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setAuthError('');
    setShowAuthModal(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (authMode === 'signup' && !name.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setAuthError('Please fill in all email and password fields.');
      return;
    }

    // Simulate standard authenticating behavior
    const u = { 
      email: email.trim(), 
      name: authMode === 'signup' ? name.trim() : email.split('@')[0] 
    };
    onAuthSuccess(u);
  };

  const handleContinueWithGoogle = () => {
    // Elegant mock auth that connects instantly
    const u = { email: 'astronaut@google.com', name: 'Commander Astro' };
    onAuthSuccess(u);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex flex-col relative overflow-hidden font-sans select-none">
      {/* Glow Ambient Effects */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#0095ff]/7 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating stars or nodes back layer */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Global Header */}
      <header className="h-20 border-b border-white/5 backdrop-blur-md bg-[#0d1117]/60 sticky top-0 z-40 px-6 sm:px-12 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center shadow-lg shadow-[#0095ff]/10">
            <svg className="w-5 h-5 text-[#0095ff] drop-shadow-[0_0_8px_rgba(0,149,255,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-white">
            Nebula<span className="bg-gradient-to-r from-[#0095ff] to-cyan-400 bg-clip-text text-transparent"> Drive</span>
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleOpenAuth('signin')}
            className="text-sm font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer py-2 px-3"
          >
            Sign In
          </button>
          <button
            onClick={() => handleOpenAuth('signup')}
            className="text-sm font-semibold bg-[#0095ff] hover:bg-sky-500 active:scale-95 text-white py-2 px-5 rounded-xl transition-all cursor-pointer shadow-lg shadow-[#0095ff]/20"
          >
            Sign Up
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 max-w-7xl mx-auto px-6 sm:px-12 py-16 md:py-24 flex flex-col items-center justify-center text-center relative z-10">
        {/* Custom Pill Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#0095ff]/30 bg-[#0095ff]/5 backdrop-blur-md text-[#0095ff] text-xs font-semibold mb-8 animate-pulse-soft">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Introducing Secure Cloud Decompression</span>
        </div>

        {/* Hero Title */}
        <h1 className="font-display font-bold text-4xl sm:text-6xl md:text-7xl tracking-tight text-white max-w-4xl leading-[1.1] mb-6">
          Decompress, Stream & <br />
          Explore in{' '}
          <span className="bg-gradient-to-r from-[#0095ff] via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
            Deep Space
          </span>
        </h1>

        {/* Hero Description */}
        <p className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed mb-10">
          Nebula Drive is a next-generation high-integrity binary storage platform. Inspect archive files remotely, stream movies and audios instantly, and navigate nested workspaces without local extraction.
        </p>

        {/* CTA Button */}
        <button
          onClick={() => handleOpenAuth('signup')}
          className="group relative inline-flex items-center gap-2.5 bg-gradient-to-r from-[#0095ff] to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-white font-bold text-sm sm:text-base py-4 px-8 rounded-2xl transition-all duration-300 transform active:scale-95 cursor-pointer shadow-xl shadow-[#0095ff]/25 animate-pulse-soft"
        >
          <span>Get Started For Free</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Bento Features Grid */}
        <div className="mt-24 sm:mt-32 w-full">
          <div className="text-left mb-10">
            <h2 className="font-display font-semibold text-2xl text-white">Quantum Core Architecture</h2>
            <p className="text-xs text-slate-500 mt-1">Engineered for low latency remote archive manipulation and active sync networks.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bento 1: Direct ZIP Extraction */}
            <div className="bg-[#161b22]/70 border border-white/5 hover:border-[#0095ff]/30 hover:shadow-2xl hover:shadow-[#0095ff]/5 hover:-translate-y-1.5 p-8 rounded-3xl text-left transition-all duration-300 ease-out group">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="font-display font-semibold text-lg text-white mb-2">Direct ZIP Extraction</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Inspect, query, and preview documents or media nested inside `.zip` and `.rar` files directly in our remote cloud, eliminating downloading files you don't need.
              </p>
            </div>

            {/* Bento 2: High-Definition Streaming */}
            <div className="bg-[#161b22]/70 border border-white/5 hover:border-[#0095ff]/30 hover:shadow-2xl hover:shadow-[#0095ff]/5 hover:-translate-y-1.5 p-8 rounded-3xl text-left transition-all duration-300 ease-out group">
              <div className="w-12 h-12 bg-[#0095ff]/10 text-[#0095ff] rounded-2xl flex items-center justify-center mb-6 border border-[#0095ff]/20 group-hover:scale-110 transition-transform">
                <Play className="w-6 h-6" />
              </div>
              <h3 className="font-display font-semibold text-lg text-white mb-2">High-Definition Streaming</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Our smart chunking media engine serves raw file buffers seamlessly. Play backup video tracks and audio playlists instantly on our custom player.
              </p>
            </div>

            {/* Bento 3: Advanced File Explorer */}
            <div className="bg-[#161b22]/70 border border-white/5 hover:border-[#0095ff]/30 hover:shadow-2xl hover:shadow-[#0095ff]/5 hover:-translate-y-1.5 p-8 rounded-3xl text-left transition-all duration-300 ease-out group">
              <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                <HardDrive className="w-6 h-6" />
              </div>
              <h3 className="font-display font-semibold text-lg text-white mb-2">Advanced File Explorer</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Establish deeply nested folder systems, move archives instantaneously via local paths, star priorities, and rest easy with a high-integrity recycle bin.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Table Section */}
        <div className="mt-24 sm:mt-32 w-full">
          <div className="text-center mb-12">
            <h2 className="font-display font-semibold text-3xl text-white">Flexible Spaces for Any Scale</h2>
            <p className="text-xs text-slate-500 mt-2">Zero commitment pricing with native multi-active cloud integrity.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Plan 1: Starter */}
            <div className="bg-[#161b22]/50 border border-white/5 hover:-translate-y-1 p-8 rounded-3xl text-left transition-all duration-300 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-4">Starter Node</span>
                <h3 className="font-display font-bold text-2xl text-white mb-1">Free Sandbox</h3>
                <p className="text-[#0095ff] text-xl font-bold mb-6">$0 <span className="text-xs font-normal text-slate-500">/ forever</span></p>
                <div className="space-y-3.5 border-t border-white/5 pt-6 text-sm text-slate-400">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#0095ff]" />
                    <span>Unlimited File Uploads</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#0095ff]" />
                    <span>Basic Folder Navigation</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#0095ff]" />
                    <span>Standard Speed Stream</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleOpenAuth('signup')}
                className="w-full mt-8 py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer text-center"
              >
                Access Free Space
              </button>
            </div>

            {/* Plan 2: Pro - Highlighted */}
            <div className="bg-[#161b22]/90 border-2 border-[#0095ff]/50 p-8 rounded-3xl text-left transition-all duration-300 transform hover:-translate-y-1.5 flex flex-col justify-between relative shadow-xl shadow-[#0095ff]/10">
              <div className="absolute top-4 right-4 bg-[#0095ff] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                Most Popular
              </div>
              <div>
                <span className="text-xs font-bold text-[#0095ff] uppercase tracking-widest block mb-4">Active Explorer</span>
                <h3 className="font-display font-bold text-2xl text-white mb-1">Professional Space</h3>
                <p className="text-white text-3xl font-bold mb-6">$9.99 <span className="text-xs font-normal text-slate-400">/ month</span></p>
                <div className="space-y-3.5 border-t border-white/10 pt-6 text-sm text-slate-300">
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4.5 h-4.5 text-[#0095ff]" />
                    <span>Full Remote ZIP inspection</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4.5 h-4.5 text-[#0095ff]" />
                    <span>Unlimited High-Speed Media streams</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4.5 h-4.5 text-[#0095ff]" />
                    <span>Permanent Restore & Star folders</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4.5 h-4.5 text-[#0095ff]" />
                    <span>Active Railway Server backup</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleOpenAuth('signup')}
                className="w-full mt-8 py-3 bg-[#0095ff] hover:bg-sky-500 active:scale-[0.98] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer text-center shadow-lg shadow-[#0095ff]/20"
              >
                Launch Professional Drive
              </button>
            </div>

            {/* Plan 3: Enterprise */}
            <div className="bg-[#161b22]/50 border border-white/5 hover:-translate-y-1 p-8 rounded-3xl text-left transition-all duration-300 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-4">Galaxy Fleet</span>
                <h3 className="font-display font-bold text-2xl text-white mb-1">Enterprise Hub</h3>
                <p className="text-slate-400 text-xl font-bold mb-6">Custom Pricing</p>
                <div className="space-y-3.5 border-t border-white/5 pt-6 text-sm text-slate-400">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#0095ff]" />
                    <span>Dedicated Backblaze B2 cluster nodes</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#0095ff]" />
                    <span>SLA 99.99% Node uptime</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#0095ff]" />
                    <span>Administrative audit control logs</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleOpenAuth('signup')}
                className="w-full mt-8 py-3 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer text-center"
              >
                Contact Fleet Admins
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Auth Overlay Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#161b22]/95 border border-white/10 rounded-3xl p-8 shadow-2xl relative">
            
            {/* Close Button */}
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-[#161b22] border border-white/10 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 text-[#0095ff] drop-shadow-[0_0_8px_rgba(0,149,255,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white mt-1">
                {authMode === 'signin' ? 'Sign In to Nebula' : 'Create Account'}
              </h2>
              <p className="text-slate-400 text-xs text-center">
                Access your secure cloud decompression explorer
              </p>
            </div>

            {/* Error alerts */}
            {authError && (
              <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Full Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-4 flex items-center text-slate-500">
                      <User className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Luke Skywalker"
                      className="w-full bg-[#0d1117]/80 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-[#0095ff] transition-all text-white placeholder-slate-600"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-4 flex items-center text-slate-500">
                    <Mail className="w-5 h-5" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="luke@nebula.com"
                    className="w-full bg-[#0d1117]/80 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-[#0095ff] transition-all text-white placeholder-slate-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-4 flex items-center text-slate-500">
                    <Lock className="w-5 h-5" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0d1117]/80 border border-white/10 rounded-2xl py-3 pl-12 pr-12 text-sm focus:outline-none focus:border-[#0095ff] transition-all text-white placeholder-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full mt-4 bg-[#0095ff] hover:bg-sky-500 disabled:bg-[#0095ff]/50 text-white font-bold py-3.5 px-4 rounded-2xl transition-all shadow-lg shadow-[#0095ff]/15 flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                {authLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span>{authMode === 'signin' ? 'Sign In to Nebula' : 'Create Space Account'}</span>
                )}
              </button>
            </form>

            {/* Continue with Google */}
            <div className="mt-5 border-t border-white/5 pt-5">
              <button
                type="button"
                onClick={handleContinueWithGoogle}
                className="w-full py-3.5 border border-white/10 hover:bg-white/5 active:scale-[0.98] text-slate-200 hover:text-white text-xs font-bold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-3 bg-transparent"
              >
                {/* Clean Google Icon */}
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            {/* Mode switch */}
            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500">
                {authMode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                    setAuthError('');
                  }}
                  className="text-[#0095ff] hover:text-sky-400 font-semibold ml-1.5 focus:outline-none"
                >
                  {authMode === 'signin' ? 'Create Space Account' : 'Sign In instead'}
                </button>
              </p>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
