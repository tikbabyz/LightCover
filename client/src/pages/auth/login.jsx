import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'font-awesome/css/font-awesome.min.css';
import logo from '../../assets/logo.png';
import { useSlit } from '../../context/SlitContext';
import { isTokenExpired } from '../../services/authHelper';

function Login() {
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const { login } = useSlit();

    useEffect(() => {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        if (token && user && !isTokenExpired(token)) {
            navigate('/', { replace: true });
        } else if (token && isTokenExpired(token)) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        }
    }, [navigate]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const apiUrl = import.meta.env.VITE_AUTH_API_URL || '';
            const response = await axios.post(`${apiUrl}/api/auth/login`, formData);
            const { token, user } = response.data;
            if (token) {
                localStorage.setItem('token', token);
            }
            if (login) {
                login(user);
            } else if (user) {
                localStorage.setItem('user', JSON.stringify(user));
            }
            toast.success('เข้าสู่ระบบสำเร็จ!');
            navigate('/');
        } catch (error) {
            toast.error(error.response?.data?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-10 text-center">
                        <div className="bg-white rounded-full w-20 h-20 mx-auto flex items-center justify-center shadow-lg mb-4">
                            <img src={logo} alt="Logo" className="h-12 object-contain" />
                        </div>
                        <h1 className="text-white text-2xl font-bold">ยินดีต้อนรับ</h1>
                        <p className="text-blue-100 mt-2">เข้าสู่ระบบเพื่อดำเนินการต่อ</p>
                    </div>

                    {/* Form */}
                    <div className="px-8 py-8">
                        <form onSubmit={handleSubmit}>
                            {/* Username */}
                            <div className="mb-5">
                                <label className="block text-gray-700 font-medium mb-2">
                                    <i className="fa fa-user mr-2 text-blue-500"></i>
                                    ชื่อผู้ใช้
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        name="username"
                                        value={formData.username}
                                        onChange={handleChange}
                                        placeholder="กรอกชื่อผู้ใช้"
                                        className="w-full px-4 py-3 pl-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                        required
                                    />
                                    <i className="fa fa-user absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                </div>
                            </div>

                            {/* Password */}
                            <div className="mb-6">
                                <label className="block text-gray-700 font-medium mb-2">
                                    <i className="fa fa-lock mr-2 text-blue-500"></i>
                                    รหัสผ่าน
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder="กรอกรหัสผ่าน"
                                        className="w-full px-4 py-3 pl-11 pr-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                        required
                                    />
                                    <i className="fa fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                                    >
                                        <i className={`fa ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 font-medium transition shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <i className="fa fa-spinner fa-spin"></i>
                                        <span>กำลังดำเนินการ...</span>
                                    </>
                                ) : (
                                    <>
                                        <i className="fa fa-sign-in"></i>
                                        <span>เข้าสู่ระบบ</span>
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="flex items-center my-6">
                            <div className="flex-1 border-t border-gray-200"></div>
                            <span className="px-4 text-gray-400 text-sm">หรือ</span>
                            <div className="flex-1 border-t border-gray-200"></div>
                        </div>

                        {/* Register Link */}
                        <p className="text-center text-gray-600">
                            ยังไม่มีบัญชี?{' '}
                            <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition">
                                สมัครสมาชิก
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-400 text-sm mt-6">
                    © 2026 INOAC Industries (Thailand) Co., Ltd.
                </p>
            </div>
        </div>
    );
}

export default Login;