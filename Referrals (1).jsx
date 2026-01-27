import React, { useState, useEffect } from 'react'
import WebApp from '@twa-dev/sdk'
import axios from 'axios'
import { motion } from 'framer-motion'
import AdBanner from '../components/AdBanner'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'YourBotUsername'

const LEAGUE_COLORS = {
  BRONZE: '#CD7F32',
  SILVER: '#C0C0C0',
  GOLD: '#FFD700',
  DIAMOND: '#B9F2FF',
  MYTHIC: '#FF00FF',
  LEGEND: '#FF6347',
  GOD: '#FFD700'
}

const Referrals = ({ user }) => {
  const [referrals, setReferrals] = useState([])
  const [referralData, setReferralData] = useState(null)

  useEffect(() => {
    fetchReferrals()
  }, [])

  const fetchReferrals = async () => {
    try {
      const initData = WebApp.initData
      const response = await axios.get(`${API_URL}/api/referrals`, {
        headers: { 'x-telegram-init-data': initData }
      })
      setReferralData(response.data)
      setReferrals(response.data.referrals || [])
    } catch (error) {
      console.error('Fetch referrals error:', error)
    }
  }

  const handleShare = () => {
    const referralLink = `https://t.me/${BOT_USERNAME}?start=ref${user.telegramId}`
    const message = `🎮 Join me in Ultimate Tap Game and earn passive income!\n\n💰 Tap to earn coins\n🏆 Climb the leagues\n👥 Get 10% from friends' earnings\n\nJoin now: ${referralLink}`
    
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(message)}`
    WebApp.openTelegramLink(shareUrl)
    WebApp.HapticFeedback.impactOccurred('medium')
  }

  const handleCopy = () => {
    const referralLink = `https://t.me/${BOT_USERNAME}?start=ref${user.telegramId}`
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink).then(() => {
        WebApp.HapticFeedback.notificationOccurred('success')
        WebApp.showPopup({
          title: '✓ Copied!',
          message: 'Referral link copied to clipboard',
          buttons: [{ type: 'ok' }]
        })
      })
    } else {
      WebApp.showAlert(referralLink)
    }
  }

  const handleNudge = async (referralId) => {
    try {
      const initData = WebApp.initData
      await axios.post(
        `${API_URL}/api/referrals/nudge`,
        { referralId },
        { headers: { 'x-telegram-init-data': initData } }
      )
      
      WebApp.HapticFeedback.notificationOccurred('success')
      WebApp.showPopup({
        title: '✓ Sent!',
        message: 'Nudge notification sent to your friend',
        buttons: [{ type: 'ok' }]
      })
    } catch (error) {
      WebApp.showAlert('Could not send nudge notification')
    }
  }

  return (
    <div className="page-container bg-gradient-to-b from-[#0a0e27] via-[#1a1f3a] to-[#0a0e27] text-white">
      {/* AD BANNER */}
      <AdBanner blockId="YOUR_ADSGRAM_BLOCK_ID" />
      
      {/* HEADER */}
      <div className="p-6">
        <h1 className="text-4xl font-black mb-2 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
          Friends
        </h1>
        <p className="text-gray-400 text-sm">Invite friends and earn together!</p>
      </div>

      {/* REFERRAL BONUS CARD */}
      <div className="px-6 mb-6">
        <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
          <div className="relative text-center">
            <div className="text-6xl mb-3">💰</div>
            <div className="text-white/80 text-sm mb-1">Referral Bonus</div>
            <div className="text-5xl font-black text-white mb-2">10%</div>
            <div className="text-white/90 text-sm">
              Earn 10% of your friends' earnings automatically!
            </div>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 backdrop-blur-xl rounded-2xl p-4 border border-cyan-400/30">
            <div className="text-center">
              <div className="text-gray-400 text-xs mb-1">Total</div>
              <div className="text-2xl font-black text-cyan-400">
                {referralData?.referralCount || 0}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-xl rounded-2xl p-4 border border-green-400/30">
            <div className="text-center">
              <div className="text-gray-400 text-xs mb-1">Active</div>
              <div className="text-2xl font-black text-green-400">
                {referralData?.activeReferralCount || 0}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-xl rounded-2xl p-4 border border-yellow-400/30">
            <div className="text-center">
              <div className="text-gray-400 text-xs mb-1">Earned</div>
              <div className="text-2xl font-black text-yellow-400">
                {referralData?.referralEarnings?.toLocaleString() || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* REFERRAL LINK */}
      <div className="px-6 mb-6">
        <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 backdrop-blur-xl rounded-2xl p-1 border border-cyan-400/30">
          <div className="bg-[#0a0e27] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔗</span>
              <span className="text-sm font-bold text-gray-400">Your Referral Link</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleShare}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white py-4 rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all flex items-center justify-center gap-2"
              >
                <span className="text-xl">📤</span>
                Share
              </button>

              <button
                onClick={handleCopy}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(147,51,234,0.4)] hover:shadow-[0_0_30px_rgba(147,51,234,0.6)] transition-all flex items-center justify-center gap-2"
              >
                <span className="text-xl">📋</span>
                Copy
              </button>
            </div>

            <div className="mt-3 text-center text-xs text-gray-500">
              Invite friends to earn passive income!
            </div>
          </div>
        </div>
      </div>

      {/* FRIENDS LIST */}
      <div className="px-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Your Friends ({referrals.length})</h2>
        </div>

        {referrals.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">👥</div>
            <div className="text-gray-400 text-lg font-medium mb-2">No friends yet</div>
            <div className="text-gray-500 text-sm">
              Share your link to start earning!
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.map((ref, index) => (
              <motion.div
                key={ref.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 relative"
                      style={{
                        borderColor: LEAGUE_COLORS[ref.league] || '#666',
                        background: `linear-gradient(135deg, ${LEAGUE_COLORS[ref.league]}33, ${LEAGUE_COLORS[ref.league]}11)`
                      }}
                    >
                      <span>👤</span>
                      {ref.isActive && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0a0e27]" />
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <div className="font-bold text-lg">{ref.username}</div>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className="font-bold"
                          style={{ color: ref.leagueColor }}
                        >
                          {ref.league}
                        </span>
                        <span className="text-gray-500">•</span>
                        <span className="text-yellow-400 font-bold">
                          {ref.earnings?.toLocaleString() || 0}
                        </span>
                        <span className="text-gray-500">coins</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div>
                    {!ref.isActive && (
                      <button
                        onClick={() => handleNudge(ref.id)}
                        className="bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 px-4 py-2 rounded-xl text-xs font-bold border border-orange-400/50 hover:bg-orange-500/30 transition-all"
                      >
                        🔔 Nudge
                      </button>
                    )}
                    {ref.isActive && (
                      <div className="text-green-400 text-xs font-bold bg-green-500/20 px-4 py-2 rounded-xl border border-green-400/50">
                        ✓ Active
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* INFO SECTION */}
      <div className="px-6 mt-8">
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-3xl">💡</span>
            <div>
              <div className="font-bold text-lg mb-2 text-cyan-400">How it works</div>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">•</span>
                  <span>Share your unique referral link with friends</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">•</span>
                  <span>They join the game using your link</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">•</span>
                  <span>You earn 10% of everything they make - automatically!</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">•</span>
                  <span>Unlock special skins when you reach 5 and 10 active friends</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-cyan-400/20 pt-4 mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Active = played in last 7 days</span>
              <span className="text-cyan-400 font-bold">🎁 Passive Income!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Referrals
