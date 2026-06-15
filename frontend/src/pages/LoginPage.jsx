import { useState } from "react"
import { loginUser } from "../services/authService"
import { useNavigate } from "react-router-dom"
import { getCurrentUser } from "../services/authService"
import toast from "react-hot-toast"

function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("") // Retained state in case you use it for form validation later
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const data = await loginUser(email, password)
      localStorage.setItem("token", data.access_token)

      const user = await getCurrentUser(data.access_token)
      localStorage.setItem("role", user.role)

      if (user.role === "admin") {
        navigate("/admin")
      } else if (user.role === "therapist") {
        navigate("/therapist")
      }

      toast.success("Login successful 🚀")
    } catch {
      toast.error("Invalid credentials")
    }
  }

  return (
    /* px-4 ensures the card layout doesn't clip or stick directly to screen borders on smaller viewports */
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      
      {/* Container scaling: dynamic padding (p-6 to p-8) and width boundaries */}
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 w-full max-w-md border border-gray-100/50">
        
        {/* Header Branding */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-blue-600 tracking-tight">
            Therapist Travel App
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-2 font-medium">
            Login to access your dashboard
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center mb-4 bg-red-50 py-2 rounded-lg font-medium">
            {error}
          </p>
        )}

        <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
          
          {/* Email Input Field */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm sm:text-base bg-gray-50/50 focus:bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
            />
          </div>

          {/* Password Input Field */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm sm:text-base bg-gray-50/50 focus:bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
            />
          </div>

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 active:scale-[0.99] font-semibold text-sm sm:text-base transition-all duration-150 shadow-md shadow-blue-500/10 hover:shadow-blue-500/20"
            >
              Sign In
            </button>
          </div>

        </form>

      </div>
    </div>
  )
}

export default LoginPage