import { useState } from 'react'
import DropdownSelect from './DropdownSelect'

const classificationModels = [
  'Random forest (RF)',
  'Linear discriminant analysis (LDA)',
  'Support vector machine (SVM)',
  'Extreme gradient boosting (XGBoost)',
  'Neural network (BPNN)',
]

const regressionModels = [
  'Random forest (RF)',
  'Support vector regression (SVR)',
  'Extreme gradient boosting (XGBoost)',
  'Neural network (BPNN)',
]

const sampleClassification = [
  { id: 'S001', predicted: 'Qualified', probQualified: '0.82', probUnqualified: '0.18' },
  { id: 'S002', predicted: 'Unqualified', probQualified: '0.34', probUnqualified: '0.66' },
  { id: 'S003', predicted: 'Qualified', probQualified: '0.74', probUnqualified: '0.26' },
]

const sampleRegression = [
  { id: 'S001', predictedSpeed: '48.2' },
  { id: 'S002', predictedSpeed: '66.9' },
  { id: 'S003', predictedSpeed: '52.4' },
]

export default function PredictForm() {
  const [clsModel, setClsModel] = useState(classificationModels[0])
  const [regModel, setRegModel] = useState(regressionModels[0])

  return (
    <div className="page">
      <section className="page-section">
        <div className="section-header">
          <h2>Explore</h2>
        </div>
        <div className="grid grid--two">
          <div className="card">
            <h3 className="card-title">Damage analysis (classification)</h3>
            <div className="form-row">
              <label htmlFor="cls-model">Classification model</label>
              <DropdownSelect
                id="cls-model"
                className="select"
                value={clsModel}
                onChange={(event) => setClsModel(event.target.value)}
              >
                {classificationModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </DropdownSelect>
            </div>
            <div className="table-actions">
              <button type="button" className="btn btn--primary" disabled>
                Evaluate labeled data
              </button>
              <button type="button" className="btn btn--outline" disabled>
                Run prediction
              </button>
            </div>
            <div className="status-note">
              Connect the backend pipeline to enable evaluation and prediction.
            </div>
            <div className="divider" />
            <div className="grid">
              <div className="plot-placeholder">Confusion matrix will appear here.</div>
              <div className="plot-placeholder">ROC curve will appear here.</div>
            </div>
            <div className="divider" />
            <table className="table">
              <caption>Sample classification output</caption>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Predicted class</th>
                  <th>Prob Qualified</th>
                  <th>Prob Unqualified</th>
                </tr>
              </thead>
              <tbody>
                {sampleClassification.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.predicted}</td>
                    <td>{row.probQualified}</td>
                    <td>{row.probUnqualified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 className="card-title">Acceleration prediction (regression)</h3>
            <div className="form-row">
              <label htmlFor="reg-model">Regression model</label>
              <DropdownSelect
                id="reg-model"
                className="select"
                value={regModel}
                onChange={(event) => setRegModel(event.target.value)}
              >
                {regressionModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </DropdownSelect>
            </div>
            <div className="table-actions">
              <button type="button" className="btn btn--primary" disabled>
                Evaluate labeled data
              </button>
              <button type="button" className="btn btn--outline" disabled>
                Run prediction
              </button>
            </div>
            <div className="status-note">
              Upload data in the Data upload tab to activate regression evaluation.
            </div>
            <div className="divider" />
            <div className="grid">
              <div className="plot-placeholder">Actual vs predicted chart will appear here.</div>
              <div className="plot-placeholder">Residual distribution will appear here.</div>
            </div>
            <div className="divider" />
            <table className="table">
              <caption>Sample regression output</caption>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Predicted speed</th>
                </tr>
              </thead>
              <tbody>
                {sampleRegression.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.predictedSpeed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
