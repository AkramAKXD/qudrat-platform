let currentUserRole = 'student';
        let verifiedForgotEmail = '';
        let lastActiveSection = 'quant';
        
        let currentSectionType = ''; 
        let currentActionMode = '';   
        let selectedModelNum = 1;
        let currentTrainingQuestions = [];
        let currentQuestionIndex = 0;

        window.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('skipSound')) {
                switchView('student');
            }
        });

        function togglePasswordVisibility(fieldId, btnElement) {
            const passwordInput = document.getElementById(fieldId);
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                btnElement.innerText = '🙈';
            } else {
                passwordInput.type = 'password';
                btnElement.innerText = '👁️';
            }
        }

        function switchView(view) {
            document.querySelectorAll('.app-section').forEach(el => {
                el.classList.remove('active-view');
            });

            document.querySelectorAll('.alert').forEach(el => el.style.display = 'none');

            let targetId = '';
            if (view === 'landing') targetId = 'landing-section';
            if (view === 'login') targetId = 'login-section';
            if (view === 'register') targetId = 'register-section';
            if (view === 'forgot') {
                targetId = 'forgot-section';
                document.getElementById('forgot-step-1').classList.remove('hidden');
                document.getElementById('forgot-step-2').classList.add('hidden');
                document.getElementById('forgotEmail').value = '';
                document.getElementById('newPasswordInput').value = '';
            }
            if (view === 'student') {
                targetId = 'student-dashboard';
                const urlParams = new URLSearchParams(window.location.search);
                const skipSound = urlParams.get('skipSound');
                const studentVideo = document.getElementById('studentVideo');
                
                if (!skipSound && studentVideo) {
                    studentVideo.play().catch(e => console.log("تم حظر التشغيل التلقائي بواسطة المتصفح"));
                }
            }
            if (view === 'quant') { lastActiveSection = 'كمي'; targetId = 'quant-page'; }
            if (view === 'verbal') { lastActiveSection = 'لفظي'; targetId = 'verbal-page'; }
            if (view === 'admin') targetId = 'admin-dashboard';

            if (targetId) {
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    setTimeout(() => {
                        targetEl.classList.add('active-view');
                    }, 120);
                }
            }
        }

        function openQiyasSimulation() {
            document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-view'));
            setTimeout(() => {
                document.getElementById('qiyas-models-section').classList.add('active-view');
            }, 120);
        }

        function selectQiyasModel(modelNum) {
            document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-view'));
            setTimeout(() => {
                document.getElementById('qiyas-no-questions-section').classList.add('active-view');
            }, 120);
            document.getElementById('qiyas-no-q-title').innerText = `النموذج ${modelNum} (اختبار قياس) غير متوفر مؤقتاً`;
        }

        function backToQiyasModels() {
            document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-view'));
            setTimeout(() => {
                document.getElementById('qiyas-models-section').classList.add('active-view');
            }, 120);
        }

        function openModelsSelection(sectionType, mode) {
            currentSectionType = sectionType; 
            currentActionMode = mode;         
            
            let titleText = mode === 'training' ? '⚡ التدريب حسب النماذج' : '🎯 الاختبار المحاكي حسب النماذج';
            document.getElementById('models-title').innerText = `${titleText} (${sectionType})`;
            
            document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-view'));
            setTimeout(() => {
                document.getElementById('models-selection-section').classList.add('active-view');
            }, 120);
        }

        async function selectModel(modelNum) {
            selectedModelNum = modelNum;
            
            try {
                const res = await fetch('/api/questions');
                const allQuestions = await res.json();
                
                if (currentActionMode === 'exam') {
                    currentTrainingQuestions = [];
                } else {
                    currentTrainingQuestions = allQuestions.filter(q => 
                        q.section === currentSectionType && Number(q.model) === Number(modelNum)
                    );
                }

                document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-view'));

                if (currentTrainingQuestions.length === 0) {
                    setTimeout(() => {
                        document.getElementById('no-questions-section').classList.add('active-view');
                    }, 120);
                    
                    if (currentActionMode === 'exam') {
                        document.getElementById('no-q-title').innerText = `الاختبار المحاكي للنموذج ${modelNum} غير متوفر مؤقتاً`;
                        document.getElementById('no-q-desc').innerText = `عذراً، لم تتم إضافة أسئلة لهذا النموذج في الاختبار المحاكي مؤقتاً.`;
                    } else {
                        document.getElementById('no-q-title').innerText = `النموذج ${modelNum} غير متوفر مؤقتاً للتدريب`;
                        document.getElementById('no-q-desc').innerText = `عذراً، لم تتم إضافة أسئلة لهذا النموذج للتدريب مؤقتاً. جرب اختيار نموذج آخر!`;
                    }
                    return;
                }

                currentQuestionIndex = 0;
                setTimeout(() => {
                    document.getElementById('training-section').classList.add('active-view');
                }, 120);
                
                document.getElementById('training-main-title').innerText = `تدريب (${currentSectionType}) - النموذج ${modelNum}`;
                renderTrainingQuestion();

            } catch (error) {
                console.error("خطأ في جلب الأسئلة:", error);
                alert("حدث خطأ أثناء الاتصال بقاعدة البيانات لجلب الأسئلة.");
            }
        }

        // دالة عرض السؤال مع دعم الصور التلقائية عند إضافتها
        function renderTrainingQuestion() {
            const container = document.getElementById('training-container');
            
            if (currentQuestionIndex >= currentTrainingQuestions.length) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; background: #d1fae5; border-radius: 16px; color: #065f46;">
                        <h3 style="margin-bottom: 10px;">🎉 كفو يا بطل! أتممت جميع أسئلة هذا النموذج بنجاح.</h3>
                        <p>يمكنك العودة لاختيار نموذج آخر أو مراجعة الأقسام.</p>
                    </div>
                `;
                return;
            }

            const q = currentTrainingQuestions[currentQuestionIndex];
            
            // كود جلب وعرض الصورة إذا وُجد مسار لها في ملف الـ JSON
            let imageHtml = '';
            if (q.image) {
                imageHtml = `<div style="text-align: center; margin: 15px 0;"><img src="${q.image}" alt="صورة السؤال" style="max-width: 100%; max-height: 250px; border-radius: 10px; border: 1px solid #cbd5e1;"></div>`;
            }

            container.innerHTML = `
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 25px; border-radius: 16px; text-align: right;">
                    <span style="color: var(--primary); font-weight: bold;">السؤال ${currentQuestionIndex + 1} من ${currentTrainingQuestions.length}</span>
                    <p style="font-size: 18px; margin: 15px 0; font-weight: 700; color: #0f172a; line-height: 1.6;">${q.text}</p>
                    ${imageHtml}
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                        <button onclick="checkAnswer('${q.correct}', 'a', this)" style="background: #ffffff; color: #0f172a; text-align: right; border: 1px solid #cbd5e1; padding: 12px 15px; border-radius: 10px; cursor: pointer; font-size: 15px; width: 100%;">أ) ${q.options.a}</button>
                        <button onclick="checkAnswer('${q.correct}', 'b', this)" style="background: #ffffff; color: #0f172a; text-align: right; border: 1px solid #cbd5e1; padding: 12px 15px; border-radius: 10px; cursor: pointer; font-size: 15px; width: 100%;">ب) ${q.options.b}</button>
                        <button onclick="checkAnswer('${q.correct}', 'c', this)" style="background: #ffffff; color: #0f172a; text-align: right; border: 1px solid #cbd5e1; padding: 12px 15px; border-radius: 10px; cursor: pointer; font-size: 15px; width: 100%;">ج) ${q.options.c}</button>
                        <button onclick="checkAnswer('${q.correct}', 'd', this)" style="background: #ffffff; color: #0f172a; text-align: right; border: 1px solid #cbd5e1; padding: 12px 15px; border-radius: 10px; cursor: pointer; font-size: 15px; width: 100%;">د) ${q.options.d}</button>
                    </div>
                    <div id="answer-feedback" style="margin-top: 20px; font-weight: bold; text-align: center; font-size: 16px;"></div>
                </div>
            `;
        }

        function checkAnswer(correctOpt, chosenOpt, btnElement) {
            const feedback = document.getElementById('answer-feedback');
            const buttons = btnElement.parentElement.querySelectorAll('button');
            buttons.forEach(b => b.disabled = true);

            if (chosenOpt === correctOpt) {
                btnElement.style.background = '#d1fae5';
                btnElement.style.borderColor = '#10b981';
                btnElement.style.color = '#065f46';
                feedback.innerHTML = '<span style="color: #10b981;">إجابة صحيحة، أحسنت! 🌟</span>';
            } else {
                btnElement.style.background = '#fee2e2';
                btnElement.style.borderColor = '#dc2626';
                btnElement.style.color = '#991b1b';
                feedback.innerHTML = `<span style="color: #dc2626;">إجابة خاطئة. الإجابة الصحيحة هي الخيار (${correctOpt.toUpperCase()})</span>`;
            }

            setTimeout(() => {
                currentQuestionIndex++;
                renderTrainingQuestion();
            }, 1600);
        }

        function backToModelsSelection() {
            document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-view'));
            setTimeout(() => {
                document.getElementById('models-selection-section').classList.add('active-view');
            }, 120);
        }

        function backToSection() {
            document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-view'));
            let sectionId = currentSectionType === 'كمي' ? 'quant-page' : 'verbal-page';
            setTimeout(() => {
                document.getElementById(sectionId).classList.add('active-view');
            }, 120);
        }

        function showLoading(text, callback) {
            const overlay = document.getElementById('loadingOverlay');
            document.getElementById('loadingText').innerText = text;
            overlay.classList.add('active');
            
            setTimeout(() => {
                overlay.classList.remove('active');
                if (callback) callback();
            }, 2000);
        }

        function openSectionPage(sectionType) {
            switchView(sectionType);
        }

        function logout() {
            currentUserRole = 'student';
            localStorage.removeItem('userEmail');
            document.getElementById('loginForm').reset();
            switchView('landing');
        }

        function showAlert(section, text, success) {
            const el = document.getElementById(section + '-alert');
            if(!el) return;
            el.innerText = text;
            el.className = 'alert ' + (success ? 'alert-success' : 'alert-error');
            el.style.display = 'block';
        }

        function toggleBox(boxId) {
            document.getElementById(boxId).classList.toggle('hidden');
            document.getElementById('data-list-container').classList.add('hidden');
        }

        function goToAdminAccountsPage() {
            window.location.href = 'admin.html';
        }

        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const pass = document.getElementById('regPass').value;
            
            showLoading('جاري إنشاء الحساب وإعداد سجلك...', async () => {
                const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, pass }) });
                const data = await res.json();
                if(data.success) { 
                    showAlert('reg', data.message, true); 
                    setTimeout(() => switchView('login'), 1500); 
                } else { 
                    showAlert('reg', data.message, false); 
                }
            });
        });

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const pass = document.getElementById('loginPass').value;
            
            showLoading('جارِ التحقق من بيانات الدخول...', async () => {
                const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, pass }) });
                const data = await res.json();
                
                if(data.success) {
                    localStorage.setItem('userEmail', email);

                    currentUserRole = data.role;
                    if(data.role === 'admin') {
                        document.getElementById('admin-welcome').innerText = 'أهلاً بك، ' + data.name + ' (مشرف النظام 👑)';
                        switchView('admin');
                    } else {
                        document.getElementById('student-welcome').innerText = 'أهلاً بك يا بطل، ' + data.name + ' 👋 جاهز للتفوق؟';
                        switchView('student');
                    }
                } else { 
                    showAlert('login', data.message, false); 
                }
            });
        });

        async function verifyForgotEmail() {
            const email = document.getElementById('forgotEmail').value;
            showLoading('جارِ البحث عن البريد الإلكتروني...', async () => {
                const res = await fetch('/api/check-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
                const data = await res.json();
                if(data.success) {
                    verifiedForgotEmail = email;
                    showAlert('forgot', data.message, true);
                    document.getElementById('forgot-step-1').classList.add('hidden');
                    document.getElementById('forgot-step-2').classList.remove('hidden');
                } else {
                    showAlert('forgot', data.message, false);
                }
            });
        }

        async function submitNewPassword() {
            const newPass = document.getElementById('newPasswordInput').value;
            showLoading('جارِ تحديث كلمة المرور...', async () => {
                const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verifiedForgotEmail, newPass }) });
                const data = await res.json();
                if(data.success) {
                    showAlert('forgot', data.message, true);
                    setTimeout(() => switchView('login'), 2000);
                } else {
                    showAlert('forgot', data.message, false);
                }
            });
        }

        document.getElementById('questionForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const section = document.getElementById('qSection').value;
            const model = document.getElementById('qModel').value;
            const text = document.getElementById('qText').value;
            const options = { a: document.getElementById('qA').value, b: document.getElementById('qB').value, c: document.getElementById('qC').value, d: document.getElementById('qD').value };
            const correct = document.getElementById('qCorrect').value;
            
            const res = await fetch('/api/add-question', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, model, text, options, correct }) });
            const data = await res.json();
            if(data.success) { showAlert('q', data.message, true); document.getElementById('questionForm').reset(); }
            else { showAlert('q', 'حدث خطأ في الحفظ', false); }
        });

        async function loadQuestionsList() {
            document.getElementById('add-question-box').classList.add('hidden');
            document.getElementById('data-list-container').classList.remove('hidden');
            document.getElementById('list-title').innerText = 'الأسئلة المسجلة في المنصة:';
            const res = await fetch('/api/questions');
            const data = await res.json();
            const output = document.getElementById('data-output');
            if(data.length === 0) { output.innerHTML = '<p style="color:#64748b; text-align:center;">لا توجد أسئلة مضافة حالياً.</p>'; return; }
            output.innerHTML = data.map((q, i) => `<div class="question-card"><strong>[${q.section} - نموذج ${q.model || 1}] س${i+1}:</strong> ${q.text}<br><small style="color:#4f46e5;">أ) ${q.options.a} | ب) ${q.options.b} | ج) ${q.options.c} | د) ${q.options.d}</small><br><span style="color:#10b981;">الإجابة الصحيحة: ${q.correct.toUpperCase()}</span></div>`).join('');
        }

        async function loadUsersList() {
            document.getElementById('add-question-box').classList.add('hidden');
            const container = document.getElementById('data-list-container');
            container.classList.remove('hidden');
            
            document.getElementById('list-title').innerText = '📂 الحسابات المسجلة في المنصة:';
            const output = document.getElementById('data-output');
            output.innerHTML = '<p style="text-align:center; color:#64748b;">جاري تحميل الحسابات...</p>';

            try {
                const res = await fetch('/api/users');
                const data = await res.json();
                
                if(!data || data.length === 0) {
                    output.innerHTML = '<p style="color:#64748b; text-align:center;">لا توجد حسابات مسجلة حالياً.</p>';
                    return;
                }

                output.innerHTML = data.map((u, i) => `
                    <div class="user-card" style="background:#fff; border:1px solid #cbd5e1; padding:15px; border-radius:10px; margin-bottom:10px; text-align:right;">
                        <strong>الحساب ${i+1}: ${u.name}</strong><br>
                        <small style="color:#64748b;">البريد الإلكتروني: ${u.email}</small><br>
                        <small style="color:${u.role === 'admin' ? '#f59e0b' : '#10b981'}; font-weight:bold;">الدور: ${u.role === 'admin' ? 'مشرف النظام 👑' : 'طالب 📚'}</small>
                    </div>
                `).join('');
            } catch (error) {
                output.innerHTML = '<p style="color:#ef4444; text-align:center;">حدث خطأ أثناء جلب الحسابات من السيرفر.</p>';
            }
        }
