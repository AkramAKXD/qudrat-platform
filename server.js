// فتح لوحة إدارة نماذج الاختبارات والقوائم الثلاث (كمي، لفظي، محاكي)
function openAdminModelsManagement() {
    // إخفاء الأقسام الأخرى إذا لزم الأمر
    const contentArea = document.getElementById('adminDashboardContent') || document.body;
    
    let container = document.getElementById('adminModelsContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'adminModelsContainer';
        container.style.cssText = "margin-top: 20px;";
        contentArea.appendChild(container);
    }
    
    container.innerHTML = `
        <div style="background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h3 style="color: var(--primary); margin-bottom: 20px;">📋 إدارة نماذج الاختبارات</h3>
            <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; flex-wrap: wrap;">
                <button onclick="loadModelsList('quant')" class="tab-btn active-tab" id="btnQuant" style="padding: 10px 20px; border-radius: 8px; border:none; cursor:pointer; font-weight:bold;">القسم الكمي</button>
                <button onclick="loadModelsList('verbal')" class="tab-btn" id="btnVerbal" style="padding: 10px 20px; border-radius: 8px; border:none; cursor:pointer; font-weight:bold;">القسم اللفظي</button>
                <button onclick="loadModelsList('mock')" class="tab-btn" id="btnMock" style="padding: 10px 20px; border-radius: 8px; border:none; cursor:pointer; font-weight:bold;">اختبار محاكي لقياس</button>
            </div>
            <div id="modelsListContent">
                <!-- يتم تعبئتها ديناميكياً بالنماذج -->
            </div>
        </div>
    `;
    loadModelsList('quant');
}

// جلب وعرض النماذج التي تحتوي على أسئلة لكل قسم
async function loadModelsList(sectionKey) {
    ['quant', 'verbal', 'mock'].forEach(s => {
        const btn = document.getElementById(`btn${s.charAt(0).toUpperCase() + s.slice(1)}`);
        if(btn) {
            btn.style.background = s === sectionKey ? 'var(--primary)' : '#e2e8f0';
            btn.style.color = s === sectionKey ? '#fff' : '#1e293b';
        }
    });

    const contentDiv = document.getElementById('modelsListContent');
    contentDiv.innerHTML = '<p style="text-align: center; color: #64748b;">جاري جلب النماذج...</p>';

    try {
        const res = await fetch('/api/admin/models-status');
        const data = await res.json();
        
        if (data.success && data.models) {
            const sectionModels = data.models[sectionKey] || {};
            const modelKeys = Object.keys(sectionModels);

            if (modelKeys.length === 0) {
                contentDiv.innerHTML = '<p style="text-align: center; color: #64748b; padding: 20px;">لا توجد نماذج تحتوي على أسئلة في هذا القسم حالياً.</p>';
                return;
            }

            contentDiv.innerHTML = modelKeys.map(mKey => {
                const model = sectionModels[mKey];
                const isActive = model.isActive !== false;
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; margin-bottom: 10px; border-radius: 8px; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <strong style="font-size: 16px; color: #1e293b;">النموذج رقم (${model.modelNumber})</strong>
                            <span style="display: block; font-size: 13px; color: #64748b; margin-top: 4px;">عدد الأسئلة: ${model.questionCount} سؤال</span>
                            <span style="font-size: 12px; font-weight: bold; color: ${isActive ? '#10b981' : '#ef4444'}; margin-top: 4px; display: inline-block;">
                                ${isActive ? '🟢 النموذج نشط ويظهر للمستخدمين' : '🔴 النموذج معطل (يحتاج إلى تنشيط)'}
                            </span>
                        </div>
                        <div>
                            <button onclick="toggleModelStatus('${sectionKey}', ${model.modelNumber})" style="background: ${isActive ? '#f59e0b' : '#10b981'}; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; width: auto;">
                                ${isActive ? 'تعطيل ⏸️' : 'تنشيط ▶️'}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        contentDiv.innerHTML = '<p style="text-align: center; color: #ef4444;">حدث خطأ أثناء جلب النماذج.</p>';
    }
}

// دالة إرسال طلب التنشيط أو التعطيل للنموذج المحدد
async function toggleModelStatus(section, modelNumber) {
    try {
        const adminEmail = sessionStorage.getItem('sessionUserEmail');
        const res = await fetch('/api/admin/toggle-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section, modelNumber, adminEmail })
        });
        const data = await res.json();
        if (data.success) {
            loadModelsList(section); // تحديث القائمة ديناميكياً
        } else {
            alert(data.message || 'حدث خطأ ما');
        }
    } catch (e) {
        alert('حدث خطأ في الاتصال بالخادم');
    }
}
