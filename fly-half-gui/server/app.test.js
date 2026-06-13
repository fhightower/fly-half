import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'
import { createApp } from './app.js'

let dir, app

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fly-half-gui-'))
  app = createApp(dir)
})

const readYaml = (...p) => yaml.load(fs.readFileSync(path.join(dir, ...p), 'utf8'))

describe('playbooks', () => {
  it('round-trips a playbook to disk', async () => {
    const body = { description: 'desc', steps: ['do a thing', 'then run [[other]]'] }
    await request(app).put('/api/playbooks/my_pb').send(body).expect(200)

    expect(readYaml('playbooks', 'my_pb.yaml')).toEqual({ name: 'my_pb', ...body })

    const { body: state } = await request(app).get('/api/state').expect(200)
    expect(state.playbooks).toEqual([{ name: 'my_pb', ai_agent_notes: [], ...body }])
    expect(state.brokenRefs).toEqual([{ type: 'playbook', name: 'my_pb', missing: 'other' }])
  })

  it('round-trips ai_agent_notes lists on playbook and steps', async () => {
    const body = {
      description: '',
      ai_agent_notes: ['overall guidance', 'second note'],
      steps: [{ text: 'careful step', ai_agent_notes: ['step note'] }],
    }
    await request(app).put('/api/playbooks/noted').send(body).expect(200)
    const doc = readYaml('playbooks', 'noted.yaml')
    expect(doc.ai_agent_notes).toEqual(['overall guidance', 'second note'])
    expect(doc.steps).toEqual(body.steps)
  })

  it('normalizes legacy single-string notes to a list', async () => {
    const body = {
      ai_agent_notes: 'overall guidance',
      steps: [{ text: 'careful step', ai_agent_notes: 'step note' }],
    }
    await request(app).put('/api/playbooks/legacy').send(body).expect(200)
    const doc = readYaml('playbooks', 'legacy.yaml')
    expect(doc.ai_agent_notes).toEqual(['overall guidance'])
    expect(doc.steps).toEqual([{ text: 'careful step', ai_agent_notes: ['step note'] }])
  })

  it('rejects malformed steps', async () => {
    await request(app)
      .put('/api/playbooks/bad')
      .send({ steps: [{ playbook: 'x' }] })
      .expect(400)
    await request(app).put('/api/playbooks/bad').send({ steps: [42] }).expect(400)
    await request(app)
      .put('/api/playbooks/bad')
      .send({ steps: [{ text: 'x', ai_agent_notes: [42] }] })
      .expect(400)
  })

  it('rejects path-traversal names', async () => {
    await request(app).put('/api/playbooks/..%2Fevil').send({ steps: [] }).expect(400)
    await request(app).put('/api/playbooks/.hidden').send({ steps: [] }).expect(400)
  })

  it('allows names with spaces', async () => {
    await request(app).put('/api/playbooks/review%20ticket').send({ steps: ['x'] }).expect(200)
    expect(readYaml('playbooks', 'review ticket.yaml').name).toBe('review ticket')
  })

  it('deletes and 404s on missing', async () => {
    await request(app).put('/api/playbooks/pb').send({ steps: [] }).expect(200)
    await request(app).delete('/api/playbooks/pb').expect(200)
    await request(app).delete('/api/playbooks/pb').expect(404)
  })
})

describe('scenarios', () => {
  it('round-trips scenarios', async () => {
    const scenarios = [{ when: 'ticket assigned', then: 'review' }]
    await request(app).put('/api/scenarios').send({ scenarios }).expect(200)
    expect(readYaml('scenarios.yaml')).toEqual({ scenarios })
  })

  it('round-trips ai_agent_notes on scenarios', async () => {
    const scenarios = [{ when: 'ticket assigned', then: 'review', ai_agent_notes: ['be careful', 'check labels'] }]
    await request(app).put('/api/scenarios').send({ scenarios }).expect(200)
    expect(readYaml('scenarios.yaml')).toEqual({ scenarios })

    const { body: state } = await request(app).get('/api/state').expect(200)
    expect(state.scenarios[0].ai_agent_notes).toEqual(['be careful', 'check labels'])
  })

  it('normalizes legacy single-string scenario notes and drops empties', async () => {
    await request(app)
      .put('/api/scenarios')
      .send({ scenarios: [{ when: 'w', then: 'p', ai_agent_notes: 'one note' }] })
      .expect(200)
    expect(readYaml('scenarios.yaml').scenarios[0].ai_agent_notes).toEqual(['one note'])

    await request(app)
      .put('/api/scenarios')
      .send({ scenarios: [{ when: 'w', then: 'p', ai_agent_notes: [] }] })
      .expect(200)
    expect(readYaml('scenarios.yaml').scenarios[0]).toEqual({ when: 'w', then: 'p' })
  })

  it('rejects scenarios missing when/then', async () => {
    await request(app).put('/api/scenarios').send({ scenarios: [{ when: 'x' }] }).expect(400)
  })

  it('rejects malformed scenario notes', async () => {
    await request(app)
      .put('/api/scenarios')
      .send({ scenarios: [{ when: 'w', then: 'p', ai_agent_notes: [42] }] })
      .expect(400)
  })
})

describe('rename', () => {
  it('renames and updates all references', async () => {
    await request(app).put('/api/playbooks/child').send({ steps: ['x'] }).expect(200)
    await request(app).put('/api/playbooks/parent').send({ steps: ['run [[child]]'] }).expect(200)
    await request(app)
      .put('/api/scenarios')
      .send({ scenarios: [{ when: 'w', then: 'child' }] })
      .expect(200)

    await request(app).post('/api/playbooks/child/rename').send({ newName: 'kid' }).expect(200)

    expect(fs.existsSync(path.join(dir, 'playbooks', 'child.yaml'))).toBe(false)
    expect(readYaml('playbooks', 'kid.yaml').name).toBe('kid')
    expect(readYaml('playbooks', 'parent.yaml').steps).toEqual(['run [[kid]]'])
    expect(readYaml('scenarios.yaml').scenarios[0].then).toBe('kid')
  })

  it('renames inline [[refs]] in step text', async () => {
    await request(app).put('/api/playbooks/child').send({ steps: [] }).expect(200)
    await request(app)
      .put('/api/playbooks/parent')
      .send({
        steps: [
          'Tell the agent to [[child]]',
          { text: 'Start with [[child]] and report back', ai_agent_notes: ['n'] },
        ],
      })
      .expect(200)

    await request(app).post('/api/playbooks/child/rename').send({ newName: 'kid' }).expect(200)

    expect(readYaml('playbooks', 'parent.yaml').steps).toEqual([
      'Tell the agent to [[kid]]',
      { text: 'Start with [[kid]] and report back', ai_agent_notes: ['n'] },
    ])
  })

  it('refuses rename onto existing playbook', async () => {
    await request(app).put('/api/playbooks/a').send({ steps: [] }).expect(200)
    await request(app).put('/api/playbooks/b').send({ steps: [] }).expect(200)
    await request(app).post('/api/playbooks/a/rename').send({ newName: 'b' }).expect(400)
  })
})

describe('referrers', () => {
  it('lists scenario and playbook referrers', async () => {
    await request(app).put('/api/playbooks/target').send({ steps: [] }).expect(200)
    await request(app).put('/api/playbooks/parent').send({ steps: ['run [[target]]'] }).expect(200)
    await request(app)
      .put('/api/scenarios')
      .send({ scenarios: [{ when: 'w', then: 'target' }] })
      .expect(200)

    const { body } = await request(app).get('/api/playbooks/target/referrers').expect(200)
    expect(body.referrers).toEqual([
      { type: 'scenario', when: 'w' },
      { type: 'playbook', name: 'parent' },
    ])
  })

  it('counts inline [[refs]] as referrers and flags missing ones', async () => {
    await request(app).put('/api/playbooks/target').send({ steps: [] }).expect(200)
    await request(app)
      .put('/api/playbooks/parent')
      .send({ steps: ['run [[target]] then [[nonexistent]]'] })
      .expect(200)

    const { body } = await request(app).get('/api/playbooks/target/referrers').expect(200)
    expect(body.referrers).toEqual([{ type: 'playbook', name: 'parent' }])

    const { body: state } = await request(app).get('/api/state').expect(200)
    expect(state.brokenRefs).toEqual([{ type: 'playbook', name: 'parent', missing: 'nonexistent' }])
  })
})
