'use client';

import { useRouter } from 'next/navigation';
import '@/app/student.css';

const MOCK_SESSION_PREPARING = {
  sessionId: 'demo-preparing',
  requirements: { requirement: '请以羲和体系为主线，为学生设计一堂沉浸式中文课程，主题是太阳神话与古天文观测。' },
  pdfText: '',
  currentStep: 'generating',
  previewPhase: 'preparing',
};

const MOCK_SESSION_OUTLINE_REVIEW = {
  sessionId: 'demo-outline-review',
  requirements: { requirement: '请以羲和体系为主线，为学生设计一堂沉浸式中文课程，主题是太阳神话与古天文观测。' },
  pdfText: '',
  currentStep: 'generating',
  previewPhase: 'review',
  sceneOutlines: [
    { id: 'o1', order: 1, title: '神话导入：羲和驭日', description: '以羲和神话引入课程，介绍古人对太阳的想象与崇拜。' },
    { id: 'o2', order: 2, title: '圭表测日：古代天文仪器', description: '讲解圭表的构造与测日原理，以及节气划分的历史背景。' },
    { id: 'o3', order: 3, title: '节气历法与农耕文明', description: '解析二十四节气如何指导农事，以及历法对文明的深远影响。' },
    { id: 'o4', order: 4, title: '羲和号卫星：现代太阳探测', description: '介绍羲和号卫星的科学使命与太阳探测成果，连接神话与现代航天。' },
  ],
};


export default function DemoPage() {
  const router = useRouter();

  const go = (session: object) => {
    sessionStorage.setItem('generationSession', JSON.stringify(session));
    router.push('/generation-preview?demo=true');
  };

  const goStudent = (preset: string) => {
    router.push(`/student?preset=${preset}`);
  };

  const btnStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '14px 20px',
    background: 'rgba(5,7,17,0.82)',
    border: '1px solid rgba(255,197,90,0.45)',
    color: '#ffc55a',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: '"华文中宋","STZhongsong","STSong",serif',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '32px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    letterSpacing: '0.18em',
    color: 'rgba(198,208,223,0.5)',
    marginBottom: '10px',
    textTransform: 'uppercase',
  };

  return (
    <div
      className="student-page"
      style={{ minHeight: '100dvh', padding: '48px 24px', display: 'flex', justifyContent: 'center' }}
    >
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <h1
          className="s-title"
          style={{ fontSize: '22px', letterSpacing: '0.1em', color: '#ffc55a', marginBottom: '8px' }}
        >
          UI 预览面板
        </h1>
        <p style={{ color: 'rgba(198,208,223,0.55)', fontSize: '12px', marginBottom: '40px' }}>
          无需 API，直接跳转各界面查看设计效果
        </p>

        <div style={sectionStyle}>
          <p style={labelStyle}>二级界面 · /student</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              ['sun', '羲和·太阳天火课堂'],
              ['moon', '望舒·月轮文脉课堂'],
              ['mars', '祝融·星火火星课堂'],
              ['stars', '星燧·星河星宿课堂'],
              ['chanye', '嫦娥探月技术解析'],
              ['rocket', '可回收火箭技术解析'],
            ].map(([key, title]) => (
              <button
                key={key}
                style={btnStyle}
                onClick={() => goStudent(key)}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#ffc55a';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(255,197,90,0.2)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,197,90,0.45)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                }}
              >
                {title}
              </button>
            ))}
          </div>
        </div>

        <div style={sectionStyle}>
          <p style={labelStyle}>生成预览 · /generation-preview</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              style={btnStyle}
              onClick={() => go(MOCK_SESSION_PREPARING)}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#ffc55a';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(255,197,90,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,197,90,0.45)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              生成中（加载状态）
            </button>
            <button
              style={btnStyle}
              onClick={() => go(MOCK_SESSION_OUTLINE_REVIEW)}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#ffc55a';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(255,197,90,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,197,90,0.45)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              大纲审阅（review 状态）
            </button>
            <button
              style={{ ...btnStyle, borderColor: 'rgba(255,80,80,0.4)', color: '#ff8080' }}
              onClick={() => {
                sessionStorage.removeItem('generationSession');
                router.push('/generation-preview');
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#ff5050';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(255,80,80,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,80,80,0.4)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              无 session（错误状态）
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <p style={labelStyle}>课堂 · /demo-classroom</p>
          <button
            style={btnStyle}
            onClick={() => router.push('/demo-classroom')}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#ffc55a';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(255,197,90,0.2)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,197,90,0.45)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            课堂 UI（4 张演示幻灯片）
          </button>
        </div>

        <div style={sectionStyle}>
          <p style={labelStyle}>classroom 错误界面</p>
          <button
            style={{ ...btnStyle, borderColor: 'rgba(255,80,80,0.4)', color: '#ff8080' }}
            onClick={() => router.push('/classroom/demo-nonexistent-id')}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#ff5050';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 12px rgba(255,80,80,0.2)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,80,80,0.4)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            课堂加载失败（重试界面）
          </button>
        </div>
      </div>
    </div>
  );
}
