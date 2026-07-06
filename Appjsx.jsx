import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'salary-mobile-app-v2'
const LEGACY_STORAGE_KEY = 'salary-mobile-app-v1'

const DEFAULT_CATEGORY_DEFINITIONS = [
  { key: 'bookkeeping', name: '理账项目', mode: 'fixed', value: 300, note: '默认按固定提成结算' },
  { key: 'audit', name: '审计项目', mode: 'rate', value: 8, note: '默认按项目金额比例计提' },
  { key: 'consulting', name: '财顾项目', mode: 'rate', value: 10, note: '默认按顾问收入比例计提' },
  { key: 'other', name: '其他项目', mode: 'fixed', value: 200, note: '其他业务项目提成' },
]

const emptyEmployeeForm = {
  name: '',
  role: '',
  salaryAccount: '',
  phone: '',
  baseSalary: '',
  note: '',
}

const emptyProjectForm = {
  name: '',
  typeKey: DEFAULT_CATEGORY_DEFINITIONS[0].key,
  period: getCurrentPeriod(),
  projectAmount: '',
  commissionMode: DEFAULT_CATEGORY_DEFINITIONS[0].mode,
  commissionValue: DEFAULT_CATEGORY_DEFINITIONS[0].value,
  status: 'in_progress',
  compliancePassed: false,
  note: '',
  participants: [],
}

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getCurrentPeriod() {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function parseAmount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
}

function createDefaultCategories() {
  return DEFAULT_CATEGORY_DEFINITIONS.map((item) => ({
    id: item.key,
    key: item.key,
    name: item.name,
    mode: item.mode,
    value: item.value,
    note: item.note,
  }))
}

function createDefaultState() {
  return {
    currentPeriod: getCurrentPeriod(),
    employees: [],
    commissionCategories: createDefaultCategories(),
    projects: [],
    payrollRecords: [],
  }
}

function createEmptyPayrollRecord(employee, period) {
  return {
    id: uid(),
    employeeId: employee.id,
    period,
    baseSalary: parseAmount(employee.baseSalary),
    attendanceAdjustment: 0,
    socialInsurance: 0,
    subsidies: {
      computer: 0,
      businessTrip: 0,
      other: 0,
    },
    note: '',
    updatedAt: new Date().toISOString(),
  }
}

function normalizeEmployee(employee) {
  return {
    id: employee.id || uid(),
    name: employee.name || '',
    role: employee.role || '',
    salaryAccount: employee.salaryAccount || '',
    phone: employee.phone || '',
    baseSalary: parseAmount(employee.baseSalary),
    note: employee.note || '',
    updatedAt: employee.updatedAt || new Date().toISOString(),
  }
}

function normalizeCategories(categories) {
  const incoming = Array.isArray(categories) ? categories : []

  return DEFAULT_CATEGORY_DEFINITIONS.map((definition) => {
    const found = incoming.find(
      (item) => item.key === definition.key || item.id === definition.key || item.name === definition.name,
    )

    return {
      id: definition.key,
      key: definition.key,
      name: found?.name || definition.name,
      mode: found?.mode === 'rate' ? 'rate' : definition.mode,
      value: parseAmount(found?.value ?? definition.value),
      note: found?.note || definition.note,
    }
  })
}

function normalizeParticipant(participant) {
  return {
    id: participant.id || uid(),
    employeeId: participant.employeeId || '',
    allocationMode: participant.allocationMode === 'fixed' ? 'fixed' : 'ratio',
    allocationValue: parseAmount(participant.allocationValue),
  }
}

function normalizeProject(project, categories) {
  const category = categories.find((item) => item.key === project.typeKey) || categories[0]

  return {
    id: project.id || uid(),
    name: project.name || '',
    typeKey: project.typeKey || category.key,
    period: project.period || getCurrentPeriod(),
    projectAmount: parseAmount(project.projectAmount),
    commissionMode: project.commissionMode === 'rate' ? 'rate' : category.mode,
    commissionValue: parseAmount(project.commissionValue ?? category.value),
    status: project.status === 'completed' ? 'completed' : 'in_progress',
    compliancePassed: Boolean(project.compliancePassed),
    note: project.note || '',
    participants: Array.isArray(project.participants)
      ? project.participants.map(normalizeParticipant)
      : [],
    updatedAt: project.updatedAt || new Date().toISOString(),
  }
}

function normalizePayrollRecord(record, employees) {
  const employee = employees.find((item) => item.id === record.employeeId)

  return {
    id: record.id || uid(),
    employeeId: record.employeeId || '',
    period: record.period || getCurrentPeriod(),
    baseSalary: parseAmount(record.baseSalary ?? employee?.baseSalary),
    attendanceAdjustment: parseAmount(record.attendanceAdjustment),
    socialInsurance: parseAmount(record.socialInsurance),
    subsidies: {
      computer: parseAmount(record.subsidies?.computer),
      businessTrip: parseAmount(record.subsidies?.businessTrip),
      other: parseAmount(record.subsidies?.other),
    },
    note: record.note || '',
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
}

function migrateLegacyState(legacyRaw) {
  if (!legacyRaw) {
    return createDefaultState()
  }

  try {
    const legacy = JSON.parse(legacyRaw)
    return {
      currentPeriod: legacy.currentPeriod || getCurrentPeriod(),
      employees: Array.isArray(legacy.employees) ? legacy.employees.map(normalizeEmployee) : [],
      commissionCategories: createDefaultCategories(),
      projects: [],
      payrollRecords: [],
    }
  } catch {
    return createDefaultState()
  }
}

function loadAppState() {
  const fallback = createDefaultState()

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return migrateLegacyState(localStorage.getItem(LEGACY_STORAGE_KEY))
    }

    const parsed = JSON.parse(raw)
    const employees = Array.isArray(parsed.employees) ? parsed.employees.map(normalizeEmployee) : []
    const commissionCategories = normalizeCategories(parsed.commissionCategories)
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.map((project) => normalizeProject(project, commissionCategories))
      : []
    const payrollRecords = Array.isArray(parsed.payrollRecords)
      ? parsed.payrollRecords.map((record) => normalizePayrollRecord(record, employees))
      : []

    return {
      currentPeriod: parsed.currentPeriod || fallback.currentPeriod,
      employees,
      commissionCategories,
      projects,
      payrollRecords,
    }
  } catch {
    return fallback
  }
}

function getSubsidyTotal(record) {
  return (
    parseAmount(record?.subsidies?.computer) +
    parseAmount(record?.subsidies?.businessTrip) +
    parseAmount(record?.subsidies?.other)
  )
}

function getBasicSalaryNet(record) {
  return (
    parseAmount(record?.baseSalary) +
    parseAmount(record?.attendanceAdjustment) -
    parseAmount(record?.socialInsurance) +
    getSubsidyTotal(record)
  )
}

function getProjectCommissionBase(project) {
  if (!project) {
    return 0
  }

  if (project.commissionMode === 'rate') {
    return parseAmount(project.projectAmount) * parseAmount(project.commissionValue) * 0.01
  }

  return parseAmount(project.commissionValue)
}

function isProjectSettled(project) {
  return project.status === 'completed' && project.compliancePassed
}

function getParticipantCommission(project, participant) {
  const baseCommission = getProjectCommissionBase(project)

  if (participant.allocationMode === 'fixed') {
    return parseAmount(participant.allocationValue)
  }

  return baseCommission * parseAmount(participant.allocationValue) * 0.01
}

function getEmployeeProjectCommissions(projects, employeeId, period) {
  return projects
    .filter((project) => project.period === period && isProjectSettled(project))
    .flatMap((project) =>
      project.participants
        .filter((participant) => participant.employeeId === employeeId)
        .map((participant) => ({
          projectId: project.id,
          projectName: project.name,
          categoryName: project.typeKey,
          amount: getParticipantCommission(project, participant),
          allocationMode: participant.allocationMode,
          allocationValue: participant.allocationValue,
        })),
    )
}

function getEmployeePeriodTotal(record, projects, employeeId, period) {
  const basicSalaryNet = record ? getBasicSalaryNet(record) : 0
  const commissionItems = getEmployeeProjectCommissions(projects, employeeId, period)
  const commissionTotal = commissionItems.reduce((sum, item) => sum + item.amount, 0)

  return {
    basicSalaryNet,
    commissionTotal,
    totalSalary: basicSalaryNet + commissionTotal,
    commissionItems,
  }
}

function App() {
  const [appState, setAppState] = useState(loadAppState)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState(() => getCurrentPeriod())
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm)
  const [editingEmployeeId, setEditingEmployeeId] = useState('')
  const [editingProjectId, setEditingProjectId] = useState('')
  const [projectForm, setProjectForm] = useState(emptyProjectForm)

  const { currentPeriod, employees, commissionCategories, projects, payrollRecords } = appState

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState))
  }, [appState])

  useEffect(() => {
    if (!employees.length) {
      setSelectedEmployeeId('')
      return
    }

    if (!employees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(employees[0].id)
    }
  }, [employees, selectedEmployeeId])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  )

  const currentPayrollRecord = useMemo(() => {
    if (!selectedEmployee || !selectedPeriod) {
      return null
    }

    return (
      payrollRecords.find(
        (record) => record.employeeId === selectedEmployee.id && record.period === selectedPeriod,
      ) || createEmptyPayrollRecord(selectedEmployee, selectedPeriod)
    )
  }, [payrollRecords, selectedEmployee, selectedPeriod])

  const currentPayrollTotals = useMemo(() => {
    if (!selectedEmployee || !currentPayrollRecord) {
      return null
    }

    return getEmployeePeriodTotal(currentPayrollRecord, projects, selectedEmployee.id, selectedPeriod)
  }, [currentPayrollRecord, projects, selectedEmployee, selectedPeriod])

  const employeeSummaries = useMemo(
    () =>
      employees.map((employee) => {
        const currentRecord = payrollRecords.find(
          (record) => record.employeeId === employee.id && record.period === currentPeriod,
        )
        const currentTotals = getEmployeePeriodTotal(currentRecord, projects, employee.id, currentPeriod)

        const periods = new Set([
          ...payrollRecords.filter((record) => record.employeeId === employee.id).map((record) => record.period),
          ...projects
            .filter((project) => isProjectSettled(project))
            .flatMap((project) =>
              project.participants
                .filter((participant) => participant.employeeId === employee.id)
                .map(() => project.period),
            ),
        ])

        const cumulativeSalary = [...periods].reduce((sum, period) => {
          const record = payrollRecords.find(
            (item) => item.employeeId === employee.id && item.period === period,
          )
          return sum + getEmployeePeriodTotal(record, projects, employee.id, period).totalSalary
        }, 0)

        return {
          ...employee,
          currentBasicSalary: currentTotals.basicSalaryNet,
          currentCommission: currentTotals.commissionTotal,
          currentSalary: currentTotals.totalSalary,
          cumulativeSalary,
          recordCount: periods.size,
        }
      }),
    [employees, payrollRecords, projects, currentPeriod],
  )

  const overviewStats = useMemo(() => {
    const currentBasicTotal = payrollRecords
      .filter((record) => record.period === currentPeriod)
      .reduce((sum, record) => sum + getBasicSalaryNet(record), 0)

    const currentCommissionTotal = projects
      .filter((project) => project.period === currentPeriod && isProjectSettled(project))
      .reduce((sum, project) => {
        return (
          sum +
          project.participants.reduce(
            (projectSum, participant) => projectSum + getParticipantCommission(project, participant),
            0,
          )
        )
      }, 0)

    return {
      employees: employees.length,
      settledProjects: projects.filter((project) => isProjectSettled(project)).length,
      currentBasicTotal,
      currentCommissionTotal,
      currentSalaryTotal: currentBasicTotal + currentCommissionTotal,
    }
  }, [employees.length, payrollRecords, projects, currentPeriod])

  const selectedEmployeeHistory = useMemo(() => {
    if (!selectedEmployeeId) {
      return []
    }

    const periods = new Set([
      ...payrollRecords.filter((record) => record.employeeId === selectedEmployeeId).map((record) => record.period),
      ...projects
        .filter((project) => isProjectSettled(project))
        .flatMap((project) =>
          project.participants
            .filter((participant) => participant.employeeId === selectedEmployeeId)
            .map(() => project.period),
        ),
    ])

    return [...periods]
      .sort((a, b) => b.localeCompare(a))
      .map((period) => {
        const record = payrollRecords.find(
          (item) => item.employeeId === selectedEmployeeId && item.period === period,
        )
        return {
          period,
          record,
          totals: getEmployeePeriodTotal(record, projects, selectedEmployeeId, period),
        }
      })
  }, [payrollRecords, projects, selectedEmployeeId])

  const categoryNameMap = useMemo(
    () =>
      commissionCategories.reduce((map, category) => {
        map[category.key] = category.name
        return map
      }, {}),
    [commissionCategories],
  )

  const projectSummaries = useMemo(
    () =>
      projects
        .slice()
        .sort((a, b) => b.period.localeCompare(a.period) || b.updatedAt.localeCompare(a.updatedAt))
        .map((project) => ({
          ...project,
          categoryName: categoryNameMap[project.typeKey] || '未分类项目',
          commissionBase: getProjectCommissionBase(project),
          allocatedTotal: project.participants.reduce(
            (sum, participant) => sum + getParticipantCommission(project, participant),
            0,
          ),
        })),
    [projects, categoryNameMap],
  )

  function updateAppState(updater) {
    setAppState((prev) => updater(prev))
  }

  function upsertPayrollRecord(employeeId, period, updater) {
    if (!employeeId || !period) {
      return
    }

    updateAppState((prev) => {
      const employee = prev.employees.find((item) => item.id === employeeId)
      if (!employee) {
        return prev
      }

      const nextRecords = [...prev.payrollRecords]
      const targetIndex = nextRecords.findIndex(
        (record) => record.employeeId === employeeId && record.period === period,
      )
      const baseRecord =
        targetIndex >= 0 ? nextRecords[targetIndex] : createEmptyPayrollRecord(employee, period)
      const draftRecord = updater(baseRecord)
      const nextRecord = {
        ...draftRecord,
        employeeId,
        period,
        baseSalary: parseAmount(draftRecord.baseSalary),
        attendanceAdjustment: parseAmount(draftRecord.attendanceAdjustment),
        socialInsurance: parseAmount(draftRecord.socialInsurance),
        subsidies: {
          computer: parseAmount(draftRecord.subsidies?.computer),
          businessTrip: parseAmount(draftRecord.subsidies?.businessTrip),
          other: parseAmount(draftRecord.subsidies?.other),
        },
        updatedAt: new Date().toISOString(),
      }

      if (targetIndex >= 0) {
        nextRecords[targetIndex] = nextRecord
      } else {
        nextRecords.push(nextRecord)
      }

      return {
        ...prev,
        payrollRecords: nextRecords,
      }
    })
  }

  function handleEmployeeSubmit(event) {
    event.preventDefault()
    if (!employeeForm.name.trim()) {
      return
    }

    const nextId = editingEmployeeId || uid()

    updateAppState((prev) => {
      const payload = normalizeEmployee({
        id: nextId,
        name: employeeForm.name.trim(),
        role: employeeForm.role.trim(),
        salaryAccount: employeeForm.salaryAccount.trim(),
        phone: employeeForm.phone.trim(),
        baseSalary: employeeForm.baseSalary,
        note: employeeForm.note.trim(),
        updatedAt: new Date().toISOString(),
      })

      const nextEmployees = editingEmployeeId
        ? prev.employees.map((employee) => (employee.id === editingEmployeeId ? payload : employee))
        : [...prev.employees, payload]

      return {
        ...prev,
        employees: nextEmployees,
      }
    })

    setSelectedEmployeeId(nextId)
    setEditingEmployeeId('')
    setEmployeeForm(emptyEmployeeForm)
  }

  function handleEditEmployee(employee) {
    setActiveTab('employees')
    setEditingEmployeeId(employee.id)
    setEmployeeForm({
      name: employee.name,
      role: employee.role,
      salaryAccount: employee.salaryAccount,
      phone: employee.phone,
      baseSalary: employee.baseSalary,
      note: employee.note,
    })
  }

  function handleDeleteEmployee(employeeId) {
    const employee = employees.find((item) => item.id === employeeId)
    if (!employee) {
      return
    }

    if (!window.confirm(`确认删除员工“${employee.name}”及其工资记录、项目分配吗？`)) {
      return
    }

    updateAppState((prev) => ({
      ...prev,
      employees: prev.employees.filter((employeeItem) => employeeItem.id !== employeeId),
      payrollRecords: prev.payrollRecords.filter((record) => record.employeeId !== employeeId),
      projects: prev.projects.map((project) => ({
        ...project,
        participants: project.participants.filter((participant) => participant.employeeId !== employeeId),
      })),
    }))
  }

  function handleCategoryFieldChange(categoryKey, field, value) {
    updateAppState((prev) => ({
      ...prev,
      commissionCategories: prev.commissionCategories.map((category) =>
        category.key === categoryKey
          ? {
              ...category,
              [field]: field === 'value' ? parseAmount(value) : value,
            }
          : category,
      ),
    }))
  }

  function syncProjectRuleByType(typeKey) {
    const category = commissionCategories.find((item) => item.key === typeKey)
    if (!category) {
      return
    }

    setProjectForm((prev) => ({
      ...prev,
      typeKey,
      commissionMode: category.mode,
      commissionValue: category.value,
    }))
  }

  function handleProjectSubmit(event) {
    event.preventDefault()
    if (!projectForm.name.trim()) {
      return
    }

    const participants = projectForm.participants
      .filter((participant) => participant.employeeId)
      .map((participant) => normalizeParticipant(participant))

    updateAppState((prev) => {
      const payload = normalizeProject(
        {
          id: editingProjectId || uid(),
          name: projectForm.name.trim(),
          typeKey: projectForm.typeKey,
          period: projectForm.period,
          projectAmount: projectForm.projectAmount,
          commissionMode: projectForm.commissionMode,
          commissionValue: projectForm.commissionValue,
          status: projectForm.status,
          compliancePassed: projectForm.compliancePassed,
          note: projectForm.note.trim(),
          participants,
          updatedAt: new Date().toISOString(),
        },
        prev.commissionCategories,
      )

      const nextProjects = editingProjectId
        ? prev.projects.map((project) => (project.id === editingProjectId ? payload : project))
        : [...prev.projects, payload]

      return {
        ...prev,
        projects: nextProjects,
      }
    })

    setEditingProjectId('')
    setProjectForm({
      ...emptyProjectForm,
      period: currentPeriod,
      participants: selectedEmployeeId
        ? [{ id: uid(), employeeId: selectedEmployeeId, allocationMode: 'ratio', allocationValue: 100 }]
        : [],
    })
  }

  function handleEditProject(project) {
    setActiveTab('projects')
    setEditingProjectId(project.id)
    setProjectForm({
      name: project.name,
      typeKey: project.typeKey,
      period: project.period,
      projectAmount: project.projectAmount,
      commissionMode: project.commissionMode,
      commissionValue: project.commissionValue,
      status: project.status,
      compliancePassed: project.compliancePassed,
      note: project.note,
      participants: project.participants.map((participant) => ({
        ...participant,
        allocationValue: participant.allocationValue,
      })),
    })
  }

  function handleDeleteProject(projectId) {
    const project = projects.find((item) => item.id === projectId)
    if (!project) {
      return
    }

    if (!window.confirm(`确认删除项目“${project.name}”吗？`)) {
      return
    }

    updateAppState((prev) => ({
      ...prev,
      projects: prev.projects.filter((projectItem) => projectItem.id !== projectId),
    }))
  }

  function addParticipant() {
    setProjectForm((prev) => ({
      ...prev,
      participants: [
        ...prev.participants,
        {
          id: uid(),
          employeeId: employees[0]?.id || '',
          allocationMode: 'ratio',
          allocationValue: 100,
        },
      ],
    }))
  }

  function updateParticipant(participantId, field, value) {
    setProjectForm((prev) => ({
      ...prev,
      participants: prev.participants.map((participant) =>
        participant.id === participantId
          ? {
              ...participant,
              [field]: field === 'allocationValue' ? value : value,
            }
          : participant,
      ),
    }))
  }

  function removeParticipant(participantId) {
    setProjectForm((prev) => ({
      ...prev,
      participants: prev.participants.filter((participant) => participant.id !== participantId),
    }))
  }

  function handlePayrollFieldChange(field, value) {
    upsertPayrollRecord(selectedEmployeeId, selectedPeriod, (record) => ({
      ...record,
      [field]: value,
    }))
  }

  function handleSubsidyChange(subsidyKey, value) {
    upsertPayrollRecord(selectedEmployeeId, selectedPeriod, (record) => ({
      ...record,
      subsidies: {
        ...record.subsidies,
        [subsidyKey]: value,
      },
    }))
  }

  function handleDeletePayrollRecord(recordId) {
    if (!window.confirm('确认删除这期工资记录吗？')) {
      return
    }

    updateAppState((prev) => ({
      ...prev,
      payrollRecords: prev.payrollRecords.filter((record) => record.id !== recordId),
    }))
  }

  function openEmployeePayroll(employeeId, period = currentPeriod) {
    setSelectedEmployeeId(employeeId)
    setSelectedPeriod(period)
    setActiveTab('payroll')
  }

  function handleCurrentPeriodChange(value) {
    const previousPeriod = currentPeriod
    updateAppState((prev) => ({
      ...prev,
      currentPeriod: value,
    }))

    if (selectedPeriod === previousPeriod) {
      setSelectedPeriod(value)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div>
          <span className="eyebrow">基本工资 + 项目提成</span>
          <h1>员工工资统计</h1>
          <p className="hero-text">
            面向会计公司内部使用。支持基本工资、考勤调整、社保扣除、补贴分项、项目提成、合保校验与历史工资回溯编辑，数据仍保存在本机浏览器。
          </p>
        </div>
        <div className="hero-tips">
          <div className="tip-pill">本地保存</div>
          <div className="tip-pill">合保通过后结算</div>
          <div className="tip-pill">支持多人分成</div>
        </div>
      </header>

      <nav className="tab-bar tab-bar-5" aria-label="功能导航">
        {[
          ['overview', '总览'],
          ['employees', '员工'],
          ['categories', '提成规则'],
          ['projects', '项目管理'],
          ['payroll', '工资核算'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab-button ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <section className="content-grid">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>统计概览</h2>
                <p>这里按当前工资期间汇总基本工资、已结算提成与员工情况。</p>
              </div>
              <label className="compact-field">
                <span>当前期间</span>
                <input
                  type="month"
                  value={currentPeriod}
                  onChange={(event) => handleCurrentPeriodChange(event.target.value)}
                />
              </label>
            </div>

            <div className="stats-grid">
              <StatCard label="员工人数" value={`${overviewStats.employees} 人`} />
              <StatCard label="已结算项目" value={`${overviewStats.settledProjects} 项`} />
              <StatCard label="当期基本工资" value={formatCurrency(overviewStats.currentBasicTotal)} />
              <StatCard label="当期项目提成" value={formatCurrency(overviewStats.currentCommissionTotal)} />
              <StatCard
                label="当期工资合计"
                value={formatCurrency(overviewStats.currentSalaryTotal)}
                highlight
              />
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>员工工资速览</h2>
                <p>可快速查看当期基本工资、提成和累计工资，并跳转到工资核算页。</p>
              </div>
            </div>

            {employeeSummaries.length ? (
              <div className="card-list">
                {employeeSummaries.map((employee) => (
                  <div key={employee.id} className="summary-card">
                    <div className="summary-main">
                      <div>
                        <h3>{employee.name}</h3>
                        <p>
                          {employee.role || '未填写岗位'}
                          {employee.salaryAccount ? ` · ${employee.salaryAccount}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openEmployeePayroll(employee.id)}
                      >
                        去核算
                      </button>
                    </div>
                    <div className="summary-metrics">
                      <span>基本：{formatCurrency(employee.currentBasicSalary)}</span>
                      <span>提成：{formatCurrency(employee.currentCommission)}</span>
                      <span>当期：{formatCurrency(employee.currentSalary)}</span>
                      <span>累计：{formatCurrency(employee.cumulativeSalary)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="还没有员工档案" description="先到“员工”页新增员工，再开始工资核算。" />
            )}
          </article>
        </section>
      )}

      {activeTab === 'employees' && (
        <section className="content-grid">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>{editingEmployeeId ? '编辑员工' : '新增员工'}</h2>
                <p>员工档案现在预设固定月基本工资，后续每期可再单独调整。</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleEmployeeSubmit}>
              <label>
                <span>员工姓名</span>
                <input
                  required
                  value={employeeForm.name}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="例如：张会计"
                />
              </label>
              <label>
                <span>岗位</span>
                <input
                  value={employeeForm.role}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({ ...prev, role: event.target.value }))
                  }
                  placeholder="例如：外勤会计"
                />
              </label>
              <label>
                <span>薪资账户</span>
                <input
                  value={employeeForm.salaryAccount}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({ ...prev, salaryAccount: event.target.value }))
                  }
                  placeholder="银行卡 / 支付宝 / 微信等"
                />
              </label>
              <label>
                <span>基础基本工资</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={employeeForm.baseSalary}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({ ...prev, baseSalary: event.target.value }))
                  }
                  placeholder="输入每月固定基本工资"
                />
              </label>
              <label>
                <span>联系电话</span>
                <input
                  value={employeeForm.phone}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  placeholder="方便内部沟通"
                />
              </label>
              <label className="full-width">
                <span>备注</span>
                <textarea
                  rows="3"
                  value={employeeForm.note}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="记录岗位说明、发薪备注等"
                />
              </label>
              <div className="form-actions full-width">
                <button type="submit" className="primary-button">
                  {editingEmployeeId ? '保存员工' : '新增员工'}
                </button>
                {editingEmployeeId && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setEditingEmployeeId('')
                      setEmployeeForm(emptyEmployeeForm)
                    }}
                  >
                    取消编辑
                  </button>
                )}
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>员工档案</h2>
                <p>保留原有新增、编辑、删除能力，并增加基础基本工资设置。</p>
              </div>
            </div>

            {employeeSummaries.length ? (
              <div className="card-list">
                {employeeSummaries.map((employee) => (
                  <div key={employee.id} className="summary-card">
                    <div className="summary-main">
                      <div>
                        <h3>{employee.name}</h3>
                        <p>{employee.role || '未填写岗位'}</p>
                      </div>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => openEmployeePayroll(employee.id)}
                        >
                          核算工资
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleEditEmployee(employee)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => handleDeleteEmployee(employee.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div className="summary-metrics">
                      <span>基本工资：{formatCurrency(employee.baseSalary)}</span>
                      <span>账户：{employee.salaryAccount || '未填写'}</span>
                      <span>累计记录：{employee.recordCount} 期</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="还没有员工" description="先新增员工档案，后续才能进行工资核算和项目分配。" />
            )}
          </article>
        </section>
      )}

      {activeTab === 'categories' && (
        <section className="content-grid">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>项目提成规则</h2>
                <p>内置四类项目，每类都可以单独设置默认提成模式和规则值。</p>
              </div>
            </div>

            <div className="card-list">
              {commissionCategories.map((category) => (
                <div key={category.key} className="summary-card">
                  <div className="summary-main">
                    <div>
                      <h3>{category.name}</h3>
                      <p>{category.note || '无说明'}</p>
                    </div>
                    <div className="price-tag">
                      {category.mode === 'rate'
                        ? `${parseAmount(category.value)}%`
                        : formatCurrency(category.value)}
                    </div>
                  </div>
                  <div className="form-grid">
                    <label>
                      <span>项目分类名称</span>
                      <input
                        value={category.name}
                        onChange={(event) =>
                          handleCategoryFieldChange(category.key, 'name', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>提成模式</span>
                      <select
                        value={category.mode}
                        onChange={(event) =>
                          handleCategoryFieldChange(category.key, 'mode', event.target.value)
                        }
                      >
                        <option value="fixed">固定金额</option>
                        <option value="rate">项目金额比例</option>
                      </select>
                    </label>
                    <label>
                      <span>{category.mode === 'rate' ? '默认比例（%）' : '默认固定金额'}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={category.value}
                        onChange={(event) =>
                          handleCategoryFieldChange(category.key, 'value', event.target.value)
                        }
                      />
                    </label>
                    <label className="full-width">
                      <span>说明</span>
                      <textarea
                        rows="2"
                        value={category.note}
                        onChange={(event) =>
                          handleCategoryFieldChange(category.key, 'note', event.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {activeTab === 'projects' && (
        <section className="content-grid">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>{editingProjectId ? '编辑项目' : '新增项目'}</h2>
                <p>项目登记后默认“进行中”，完成且合保通过后，才会计入对应员工当期提成。</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleProjectSubmit}>
              <label>
                <span>项目名称</span>
                <input
                  required
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="例如：A客户年度审计"
                />
              </label>
              <label>
                <span>项目分类</span>
                <select
                  value={projectForm.typeKey}
                  onChange={(event) => syncProjectRuleByType(event.target.value)}
                >
                  {commissionCategories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>结算期间</span>
                <input
                  type="month"
                  value={projectForm.period}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, period: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>项目金额</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={projectForm.projectAmount}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, projectAmount: event.target.value }))
                  }
                  placeholder="按比例计提时用于计算"
                />
              </label>
              <label>
                <span>提成规则</span>
                <select
                  value={projectForm.commissionMode}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, commissionMode: event.target.value }))
                  }
                >
                  <option value="fixed">固定金额</option>
                  <option value="rate">项目金额比例</option>
                </select>
              </label>
              <label>
                <span>{projectForm.commissionMode === 'rate' ? '提成比例（%）' : '提成金额'}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={projectForm.commissionValue}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, commissionValue: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>项目状态</span>
                <select
                  value={projectForm.status}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="in_progress">进行中</option>
                  <option value="completed">已完成</option>
                </select>
              </label>
              <label className="toggle-field">
                <span>合保校验</span>
                <button
                  type="button"
                  className={`toggle-button ${projectForm.compliancePassed ? 'enabled' : ''}`}
                  onClick={() =>
                    setProjectForm((prev) => ({
                      ...prev,
                      compliancePassed: !prev.compliancePassed,
                    }))
                  }
                >
                  {projectForm.compliancePassed ? '已通过' : '未通过'}
                </button>
              </label>
              <label className="full-width">
                <span>项目备注</span>
                <textarea
                  rows="3"
                  value={projectForm.note}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="记录客户、阶段说明、特殊约定等"
                />
              </label>

              <div className="full-width participant-block">
                <div className="sub-panel-head">
                  <div>
                    <h3>提成分配</h3>
                    <p>支持一个项目分配给多名员工，可按比例或固定金额分别设置。</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={addParticipant}>
                    新增分配
                  </button>
                </div>

                {projectForm.participants.length ? (
                  <div className="line-items">
                    {projectForm.participants.map((participant) => (
                      <div key={participant.id} className="participant-row">
                        <select
                          value={participant.employeeId}
                          onChange={(event) =>
                            updateParticipant(participant.id, 'employeeId', event.target.value)
                          }
                        >
                          <option value="">请选择员工</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={participant.allocationMode}
                          onChange={(event) =>
                            updateParticipant(participant.id, 'allocationMode', event.target.value)
                          }
                        >
                          <option value="ratio">按比例分配</option>
                          <option value="fixed">按固定金额</option>
                        </select>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={participant.allocationValue}
                          onChange={(event) =>
                            updateParticipant(participant.id, 'allocationValue', event.target.value)
                          }
                          placeholder={participant.allocationMode === 'ratio' ? '比例%' : '金额'}
                        />
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => removeParticipant(participant.id)}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-line">暂未分配员工，新增后才会参与提成结算。</div>
                )}
              </div>

              <div className="form-actions full-width">
                <button type="submit" className="primary-button">
                  {editingProjectId ? '保存项目' : '登记项目'}
                </button>
                {editingProjectId && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setEditingProjectId('')
                      setProjectForm({
                        ...emptyProjectForm,
                        period: currentPeriod,
                        participants: [],
                      })
                    }}
                  >
                    取消编辑
                  </button>
                )}
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>项目列表</h2>
                <p>只有“已完成 + 合保通过”的项目才会自动进入对应期间的提成汇总。</p>
              </div>
            </div>

            {projectSummaries.length ? (
              <div className="card-list">
                {projectSummaries.map((project) => (
                  <div key={project.id} className="summary-card">
                    <div className="summary-main">
                      <div>
                        <h3>{project.name}</h3>
                        <p>
                          {project.categoryName} · {project.period}
                        </p>
                      </div>
                      <StatusBadge settled={isProjectSettled(project)} />
                    </div>
                    <div className="summary-metrics">
                      <span>项目金额：{formatCurrency(project.projectAmount)}</span>
                      <span>
                        规则：
                        {project.commissionMode === 'rate'
                          ? `${parseAmount(project.commissionValue)}%`
                          : formatCurrency(project.commissionValue)}
                      </span>
                      <span>提成基数：{formatCurrency(project.commissionBase)}</span>
                      <span>已分配：{formatCurrency(project.allocatedTotal)}</span>
                    </div>
                    <div className="participant-tags">
                      {project.participants.length ? (
                        project.participants.map((participant) => {
                          const employee = employees.find((item) => item.id === participant.employeeId)
                          return (
                            <span key={participant.id} className="tag-pill">
                              {(employee?.name || '未指派员工') +
                                ' · ' +
                                formatCurrency(getParticipantCommission(project, participant))}
                            </span>
                          )
                        })
                      ) : (
                        <span className="tag-pill muted">暂无员工分配</span>
                      )}
                    </div>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleEditProject(project)}
                      >
                        编辑项目
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleDeleteProject(project.id)}
                      >
                        删除项目
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="还没有项目" description="先登记项目并分配员工，完成且合保通过后会进入提成。" />
            )}
          </article>
        </section>
      )}

      {activeTab === 'payroll' && (
        <section className="content-grid">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>工资核算</h2>
                <p>当期总工资 = 基本工资净额 + 当期已结算项目提成。所有基础字段都可二次编辑。</p>
              </div>
            </div>

            <div className="selector-grid">
              <label>
                <span>员工</span>
                <select
                  value={selectedEmployeeId}
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                >
                  <option value="">请选择员工</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>工资期间</span>
                <input
                  type="month"
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary-button align-end"
                onClick={() => setSelectedPeriod(currentPeriod)}
              >
                使用当前期间
              </button>
            </div>

            {selectedEmployee && currentPayrollRecord && currentPayrollTotals ? (
              <>
                <div className="totals-board">
                  <StatCard label="基本工资净额" value={formatCurrency(currentPayrollTotals.basicSalaryNet)} />
                  <StatCard label="当期项目提成" value={formatCurrency(currentPayrollTotals.commissionTotal)} />
                  <StatCard label="工资总额" value={formatCurrency(currentPayrollTotals.totalSalary)} highlight />
                </div>

                <div className="panel-group">
                  <section className="sub-panel">
                    <div className="sub-panel-head">
                      <div>
                        <h3>基本工资模块</h3>
                        <p>公式：基础基本工资 ± 考勤调整 - 个人承担社保 + 各项补贴</p>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label>
                        <span>基础基本工资</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentPayrollRecord.baseSalary}
                          onChange={(event) => handlePayrollFieldChange('baseSalary', event.target.value)}
                        />
                      </label>
                      <label>
                        <span>考勤调整</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentPayrollRecord.attendanceAdjustment}
                          onChange={(event) =>
                            handlePayrollFieldChange('attendanceAdjustment', event.target.value)
                          }
                          placeholder="可正可负"
                        />
                      </label>
                      <label>
                        <span>个人承担社保</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentPayrollRecord.socialInsurance}
                          onChange={(event) =>
                            handlePayrollFieldChange('socialInsurance', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>电脑补贴</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentPayrollRecord.subsidies.computer}
                          onChange={(event) => handleSubsidyChange('computer', event.target.value)}
                        />
                      </label>
                      <label>
                        <span>出差补贴</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentPayrollRecord.subsidies.businessTrip}
                          onChange={(event) => handleSubsidyChange('businessTrip', event.target.value)}
                        />
                      </label>
                      <label>
                        <span>其他补贴</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentPayrollRecord.subsidies.other}
                          onChange={(event) => handleSubsidyChange('other', event.target.value)}
                        />
                      </label>
                      <label className="full-width">
                        <span>工资备注</span>
                        <textarea
                          rows="3"
                          value={currentPayrollRecord.note}
                          onChange={(event) => handlePayrollFieldChange('note', event.target.value)}
                          placeholder="记录特殊调整说明"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="sub-panel">
                    <div className="sub-panel-head">
                      <div>
                        <h3>项目提成模块</h3>
                        <p>仅显示本期已完成且合保通过的项目提成。需要修改单项提成时，可回到“项目管理”编辑。</p>
                      </div>
                    </div>

                    {currentPayrollTotals.commissionItems.length ? (
                      <div className="card-list">
                        {currentPayrollTotals.commissionItems.map((item) => (
                          <div key={`${item.projectId}-${item.projectName}`} className="mini-card">
                            <div>
                              <strong>{item.projectName}</strong>
                              <p>
                                {categoryNameMap[item.categoryName] || '项目提成'} ·{' '}
                                {item.allocationMode === 'ratio'
                                  ? `按比例 ${parseAmount(item.allocationValue)}%`
                                  : `固定金额 ${formatCurrency(item.allocationValue)}`}
                              </p>
                            </div>
                            <span className="price-tag">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-line">本期暂无已结算项目提成。</div>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <EmptyState title="请先选择员工" description="如果还没有员工档案，请先到“员工”页新增。" />
            )}
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <h2>工资历史记录</h2>
                <p>保留每期完整明细，可回到指定期间继续编辑。</p>
              </div>
            </div>

            {selectedEmployeeHistory.length ? (
              <div className="card-list">
                {selectedEmployeeHistory.map(({ period, record, totals }) => (
                  <div key={period} className="summary-card">
                    <div className="summary-main">
                      <div>
                        <h3>{period}</h3>
                        <p>{record?.note || '无备注'}</p>
                      </div>
                      <div className="price-tag">{formatCurrency(totals.totalSalary)}</div>
                    </div>
                    <div className="summary-metrics">
                      <span>基本工资净额：{formatCurrency(totals.basicSalaryNet)}</span>
                      <span>项目提成：{formatCurrency(totals.commissionTotal)}</span>
                    </div>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openEmployeePayroll(selectedEmployeeId, period)}
                      >
                        打开编辑
                      </button>
                      {record && (
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => handleDeletePayrollRecord(record.id)}
                        >
                          删除记录
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无工资记录" description="先为员工录入基本工资模块或完成项目结算后，这里会显示历史记录。" />
            )}
          </article>
        </section>
      )}
    </div>
  )
}

function StatCard({ label, value, highlight = false }) {
  return (
    <div className={`stat-card ${highlight ? 'highlight' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function StatusBadge({ settled }) {
  return (
    <span className={`status-badge ${settled ? 'success' : 'pending'}`}>
      {settled ? '已结算提成' : '未进入提成'}
    </span>
  )
}

export default App
