import { useState } from "react";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { registerUser } from "../services/authService";

function RegisterUserPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("therapist");

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("token");

      await registerUser({ username: name, email, password, role }, token);
      toast.success("User created");

      setName("");
      setEmail("");
      setPassword("");
      setRole("therapist");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
    }
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-xl mx-auto px-2 sm:px-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
          Register User
        </h1>

        <form
          onSubmit={handleRegister}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-5 sm:p-8 space-y-5"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Full Name
            </label>
            <input
              type="text"
              required
              placeholder="Enter name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition duration-150"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition duration-150"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              required
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition duration-150"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Assigned System Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-3 text-sm text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition duration-150"
            >
              <option value="therapist">Therapist</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-xl transition-colors duration-150 shadow-sm text-center"
            >
              Create User
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}

export default RegisterUserPage;
