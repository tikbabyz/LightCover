import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'font-awesome/css/font-awesome.min.css';

function Register() {
    const [formData, setFormData] = useState({
        employeeId: '',
        username: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        department: ''
    });

    const departments = [
        "PDE1 PE ROLL 1",
        "PDE2 PE ROLL 2",
        "PDE3 PE ROLL 3",
    ];
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            toast.error('รหัสผ่านไม่ตรงกัน');
            return;
        }

        if (formData.password.length < 6) {
            toast.error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
            return;
        }

        setLoading(true);
        try {
            const apiUrl = import.meta.env.VITE_AUTH_API_URL || '';
            await axios.post(`${apiUrl}/api/auth/register`, {
                employeeId: parseInt(formData.employeeId, 10),
                username: formData.username,
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName,
                section: formData.department
            });
            toast.success('สมัครสมาชิกสำเร็จ!');
            navigate('/login');
        } catch (error) {
            toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => {
        if (currentStep === 1) {
            if (!formData.employeeId || !formData.firstName || !formData.lastName || !formData.department) {
                toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
                return;
            }
        }
        setCurrentStep(currentStep + 1);
    };

    const prevStep = () => {
        setCurrentStep(currentStep - 1);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md">
                {/* Register Card */}
                <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
                    {/* Header */}
                    <div className="text-center mb-4">
                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                            <i className="fa fa-user-plus text-green-600 text-xl"></i>
                        </div>
                        <h1 className="text-xl font-bold text-gray-800">สมัครสมาชิก</h1>
                        <p className="text-gray-500 text-sm">สร้างบัญชีใหม่เพื่อเริ่มต้นใช้งาน</p>
                    </div>

                    {/* Step Indicator */}
                    <div className="flex items-center justify-center mb-4">
                        <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${currentStep >= 1 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                1
                            </div>
                            <div className={`w-12 h-1 transition-all ${currentStep >= 2 ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${currentStep >= 2 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                2
                            </div>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit}>
                        {/* Step 1: Personal Info */}
                        {currentStep === 1 && (
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500 text-center">
                                    <i className="fa fa-info-circle mr-1"></i>
                                    ขั้นตอนที่ 1: ข้อมูลส่วนตัว
                                </p>

                                {/* Employee ID */}
                                <div>
                                    <label className="block text-gray-700 font-medium mb-1 text-sm">รหัสพนักงาน</label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            name="employeeId"
                                            value={formData.employeeId}
                                            onChange={handleChange}
                                            placeholder="เช่น 10001"
                                            className="w-full px-3 py-2.5 pl-10 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-gray-50 focus:bg-white text-sm"
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-200 rounded flex items-center justify-center group-focus-within:bg-green-500 transition-all">
                                            <i className="fa fa-id-card text-gray-500 text-xs group-focus-within:text-white"></i>
                                        </div>
                                    </div>
                                </div>

                                {/* First Name & Last Name */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-gray-700 font-medium mb-1 text-sm">ชื่อ</label>
                                        <input
                                            type="text"
                                            name="firstName"
                                            value={formData.firstName}
                                            onChange={handleChange}
                                            placeholder="ชื่อจริง"
                                            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-gray-50 focus:bg-white text-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-700 font-medium mb-1 text-sm">นามสกุล</label>
                                        <input
                                            type="text"
                                            name="lastName"
                                            value={formData.lastName}
                                            onChange={handleChange}
                                            placeholder="นามสกุล"
                                            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-gray-50 focus:bg-white text-sm"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Department */}
                                <div>
                                    <label className="block text-gray-700 font-medium mb-1 text-sm">แผนก</label>
                                    <div className="relative group">
                                        <select
                                            name="department"
                                            value={formData.department}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2.5 pl-10 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-gray-50 focus:bg-white appearance-none cursor-pointer text-sm"
                                            required
                                        >
                                            <option value="">-- เลือกแผนก --</option>
                                            {departments.map((section, index) => (
                                                <option key={index} value={section}>{section}</option>
                                            ))}
                                        </select>
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-200 rounded flex items-center justify-center group-focus-within:bg-green-500 transition-all">
                                            <i className="fa fa-building text-gray-500 text-xs group-focus-within:text-white"></i>
                                        </div>
                                        <i className="fa fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                                    </div>
                                </div>

                                {/* Next Button */}
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-3 rounded-lg hover:from-green-700 hover:to-green-800 font-medium transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mt-2"
                                >
                                    <span>ถัดไป</span>
                                    <i className="fa fa-arrow-right"></i>
                                </button>
                            </div>
                        )}

                        {/* Step 2: Account Info */}
                        {currentStep === 2 && (
                            <div className="space-y-3">
                                <p className="text-xs text-gray-500 text-center">
                                    <i className="fa fa-info-circle mr-1"></i>
                                    ขั้นตอนที่ 2: ข้อมูลบัญชี
                                </p>

                                {/* Username */}
                                <div>
                                    <label className="block text-gray-700 font-medium mb-1 text-sm">ชื่อผู้ใช้</label>
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            name="username"
                                            value={formData.username}
                                            onChange={handleChange}
                                            placeholder="ชื่อสำหรับเข้าสู่ระบบ"
                                            className="w-full px-3 py-2.5 pl-10 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-gray-50 focus:bg-white text-sm"
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-200 rounded flex items-center justify-center group-focus-within:bg-green-500 transition-all">
                                            <i className="fa fa-user text-gray-500 text-xs group-focus-within:text-white"></i>
                                        </div>
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-gray-700 font-medium mb-1 text-sm">รหัสผ่าน</label>
                                    <div className="relative group">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            placeholder="อย่างน้อย 6 ตัวอักษร"
                                            className="w-full px-3 py-2.5 pl-10 pr-10 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-gray-50 focus:bg-white text-sm"
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-200 rounded flex items-center justify-center group-focus-within:bg-green-500 transition-all">
                                            <i className="fa fa-lock text-gray-500 text-xs group-focus-within:text-white"></i>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-500 transition-all"
                                        >
                                            <i className={`fa ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                                        </button>
                                    </div>
                                </div>

                                {/* Confirm Password */}
                                <div>
                                    <label className="block text-gray-700 font-medium mb-1 text-sm">ยืนยันรหัสผ่าน</label>
                                    <div className="relative group">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleChange}
                                            placeholder="กรอกรหัสผ่านอีกครั้ง"
                                            className="w-full px-3 py-2.5 pl-10 pr-10 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all bg-gray-50 focus:bg-white text-sm"
                                            required
                                        />
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-200 rounded flex items-center justify-center group-focus-within:bg-green-500 transition-all">
                                            <i className="fa fa-lock text-gray-500 text-xs group-focus-within:text-white"></i>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-500 transition-all"
                                        >
                                            <i className={`fa ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                                        </button>
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={prevStep}
                                        className="flex-1 px-3 py-3 border-2 border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium flex items-center justify-center gap-2"
                                    >
                                        <i className="fa fa-arrow-left"></i>
                                        <span>ย้อนกลับ</span>
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3 rounded-lg hover:from-green-700 hover:to-green-800 disabled:from-gray-400 disabled:to-gray-500 font-medium transition-all shadow-lg flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <>
                                                <i className="fa fa-spinner fa-spin"></i>
                                                <span>กำลังสมัคร...</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="fa fa-check"></i>
                                                <span>สมัคร</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </form>

                    {/* Divider */}
                    <div className="flex items-center my-4">
                        <div className="flex-1 border-t border-gray-200"></div>
                        <span className="px-3 text-gray-400 text-xs">หรือ</span>
                        <div className="flex-1 border-t border-gray-200"></div>
                    </div>

                    {/* Login Link */}
                    <div className="text-center">
                        <p className="text-gray-600 text-sm">
                            มีบัญชีอยู่แล้ว?{' '}
                            <Link to="/login" className="text-green-600 hover:text-green-700 font-semibold hover:underline">
                                เข้าสู่ระบบ
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-400 text-xs mt-4">
                    © 2026 INOAC Industries (Thailand) Co., Ltd.
                </p>
            </div>
        </div>
    );
}

export default Register;